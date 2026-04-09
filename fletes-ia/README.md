# Fletes IA

Servicio inicial de IA para responder mensajes de WhatsApp usando whatsmeow y OpenAI.

## Requisitos
- Go 1.22+
- Una cuenta de OpenAI con acceso al modelo `gpt-4o-mini`
- WhatsApp en un telefono para escanear el QR

## Configuracion
- `cd fletes-ia`
- Copiar `.env.example` a `.env` y completar variables
- `go mod tidy`
- `go run .`

## Notas
- En el primer inicio se imprime un QR en consola.
- La sesion se guarda en `data/whatsmeow.db`.
