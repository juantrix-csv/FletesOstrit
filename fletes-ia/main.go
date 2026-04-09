package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"go.mau.fi/whatsmeow"
	waProto "go.mau.fi/whatsmeow/binary/proto"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"
	_ "modernc.org/sqlite"
)

type Config struct {
	OpenAIKey      string
	OpenAIModel    string
	OpenAIBaseURL  string
	OpenAITimeout  time.Duration
	SystemPrompt   string
	WhatsAppDBPath string
}

type OpenAIClient struct {
	apiKey       string
	baseURL      string
	model        string
	httpClient   *http.Client
	systemPrompt string
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatCompletionRequest struct {
	Model       string        `json:"model"`
	Messages    []chatMessage `json:"messages"`
	Temperature float64       `json:"temperature,omitempty"`
}

type chatCompletionResponse struct {
	Choices []struct {
		Message chatMessage `json:"message"`
	} `json:"choices"`
}

func main() {
	if err := loadDotEnv(".env"); err != nil {
		log.Fatalf("load .env: %v", err)
	}

	cfg, err := loadConfig()
	if err != nil {
		log.Fatal(err)
	}

	if err := os.MkdirAll(filepath.Dir(cfg.WhatsAppDBPath), 0o755); err != nil {
		log.Fatalf("create data dir: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	waLogger := waLog.Stdout("WA", "INFO", true)
	dbLogger := waLog.Stdout("DB", "ERROR", true)

	dbPath := filepath.ToSlash(cfg.WhatsAppDBPath)
	dsn := fmt.Sprintf("file:%s?_foreign_keys=on", dbPath)
	container, err := sqlstore.New("sqlite", dsn, dbLogger)
	if err != nil {
		log.Fatalf("init store: %v", err)
	}

	deviceStore, err := container.GetFirstDevice()
	if err != nil {
		log.Fatalf("get device: %v", err)
	}

	client := whatsmeow.NewClient(deviceStore, waLogger)
	ai := NewOpenAIClient(cfg)

	client.AddEventHandler(func(evt interface{}) {
		switch v := evt.(type) {
		case *events.Message:
			go handleMessage(ctx, client, ai, v)
		}
	})

	if client.Store.ID == nil {
		qrChan, err := client.GetQRChannel(ctx)
		if err != nil {
			log.Fatalf("get qr channel: %v", err)
		}
		if err := client.Connect(); err != nil {
			log.Fatalf("connect: %v", err)
		}
		for evt := range qrChan {
			if evt.Event == "code" {
				fmt.Printf("Scan QR: %s\n", evt.Code)
			} else {
				log.Printf("qr event: %s", evt.Event)
			}
		}
	} else {
		if err := client.Connect(); err != nil {
			log.Fatalf("connect: %v", err)
		}
	}

	<-ctx.Done()
	client.Disconnect()
}

func handleMessage(ctx context.Context, client *whatsmeow.Client, ai *OpenAIClient, evt *events.Message) {
	if evt.Info.IsFromMe {
		return
	}

	text := extractMessageText(evt.Message)
	if text == "" {
		return
	}

	reply, err := ai.Reply(ctx, text)
	if err != nil {
		log.Printf("openai error: %v", err)
		reply = "Lo siento, hubo un error generando la respuesta."
	}

	_, err = client.SendMessage(ctx, evt.Info.Chat, &waProto.Message{
		Conversation: proto.String(reply),
	})
	if err != nil {
		log.Printf("send error: %v", err)
	}
}

func extractMessageText(msg *waProto.Message) string {
	if msg == nil {
		return ""
	}

	if conversation := strings.TrimSpace(msg.GetConversation()); conversation != "" {
		return conversation
	}

	if extended := msg.GetExtendedTextMessage(); extended != nil {
		if text := strings.TrimSpace(extended.GetText()); text != "" {
			return text
		}
	}

	if image := msg.GetImageMessage(); image != nil {
		if caption := strings.TrimSpace(image.GetCaption()); caption != "" {
			return caption
		}
	}

	return ""
}

func NewOpenAIClient(cfg Config) *OpenAIClient {
	return &OpenAIClient{
		apiKey:       cfg.OpenAIKey,
		baseURL:      strings.TrimRight(cfg.OpenAIBaseURL, "/"),
		model:        cfg.OpenAIModel,
		httpClient:   &http.Client{Timeout: cfg.OpenAITimeout},
		systemPrompt: cfg.SystemPrompt,
	}
}

func (c *OpenAIClient) Reply(ctx context.Context, userText string) (string, error) {
	payload := chatCompletionRequest{
		Model: c.model,
		Messages: []chatMessage{
			{Role: "system", Content: c.systemPrompt},
			{Role: "user", Content: userText},
		},
		Temperature: 0.2,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("encode payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("build request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("send request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return "", fmt.Errorf("openai error: %s: %s", resp.Status, strings.TrimSpace(string(respBody)))
	}

	var parsed chatCompletionResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}

	if len(parsed.Choices) == 0 {
		return "", errors.New("openai returned no choices")
	}

	content := strings.TrimSpace(parsed.Choices[0].Message.Content)
	if content == "" {
		return "", errors.New("openai returned empty content")
	}

	return content, nil
}

func loadConfig() (Config, error) {
	timeout, err := parseTimeoutSeconds("OPENAI_TIMEOUT_SECONDS", 30*time.Second)
	if err != nil {
		return Config{}, err
	}

	cfg := Config{
		OpenAIKey:      strings.TrimSpace(os.Getenv("OPENAI_API_KEY")),
		OpenAIModel:    strings.TrimSpace(getEnv("OPENAI_MODEL", "gpt-4o-mini")),
		OpenAIBaseURL:  strings.TrimSpace(getEnv("OPENAI_BASE_URL", "https://api.openai.com/v1")),
		OpenAITimeout:  timeout,
		SystemPrompt:   strings.TrimSpace(getEnv("AI_SYSTEM_PROMPT", "Sos un asistente para Fletes Ostrit. Responde en espanol de forma breve y clara.")),
		WhatsAppDBPath: strings.TrimSpace(getEnv("WHATSAPP_DB_PATH", "data/whatsmeow.db")),
	}

	if cfg.OpenAIKey == "" {
		return Config{}, errors.New("OPENAI_API_KEY is required")
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func parseTimeoutSeconds(key string, fallback time.Duration) (time.Duration, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}

	seconds, err := strconv.Atoi(value)
	if err != nil || seconds <= 0 {
		return 0, fmt.Errorf("%s must be a positive integer", key)
	}

	return time.Duration(seconds) * time.Second, nil
}

func loadDotEnv(path string) error {
	file, err := os.Open(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "export ") {
			line = strings.TrimSpace(strings.TrimPrefix(line, "export "))
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		value := strings.TrimSpace(parts[1])
		value = strings.Trim(value, "\"'")
		if key == "" {
			continue
		}
		if _, exists := os.LookupEnv(key); !exists {
			_ = os.Setenv(key, value)
		}
	}

	return scanner.Err()
}
