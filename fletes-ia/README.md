# Fletes IA

Servicio inicial de IA para responder mensajes de WhatsApp usando whatsmeow y OpenRouter (OpenAI compatible).

## Requisitos
- Go 1.22+
- Una cuenta de OpenRouter con acceso al modelo `gpt-4o-mini`
- WhatsApp en un telefono para escanear el QR

## Configuracion
- `cd fletes-ia`
- Copiar `.env.example` a `.env` y completar variables
- Configurar `OPENAI_BASE_URL` a `https://openrouter.ai/api/v1` si no esta ya
- Opcional: setear `OPENAI_REFERRER` y `OPENAI_TITLE` para OpenRouter
- Editar `context.txt` con el contexto del bot
- `go mod tidy`
- `go run .`

## Notas
- En el primer inicio se imprime un QR en consola.
- La sesion se guarda en `data/whatsmeow.db`.
- Si `AI_SYSTEM_PROMPT_FILE` existe, se usa ese contenido como prompt.
