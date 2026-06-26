# Evolution API para promociones WhatsApp

Guia para instalar Evolution API en un VPS barato (DigitalOcean, Hetzner, Vultr, etc.) y conectarlo al modulo de promociones.

> Importante: Evolution API usa WhatsApp Web. Es una integracion no oficial. Para reducir riesgo de bloqueo, el sistema envia por lotes pequenos y con pausa entre mensajes. Use solo contactos/pacientes autorizados.

## 1. Crear servidor

Recomendado:

- Ubuntu 22.04 o 24.04
- 1 GB RAM minimo
- 1 vCPU
- Droplet de DigitalOcean de USD 5/mes

Apunte un subdominio al IP del servidor:

```txt
wa.tudominio.com  A  IP_DEL_SERVIDOR
```

## 2. Subir archivos al servidor

Desde su computadora, copie la carpeta:

```bash
scp -r scripts/evolution-api root@IP_DEL_SERVIDOR:/root/evolution-api
```

Entre por SSH:

```bash
ssh root@IP_DEL_SERVIDOR
cd /root/evolution-api
```

## 3. Instalar Docker, Nginx y firewall

```bash
bash install-ubuntu.sh
```

Edite variables:

```bash
nano /opt/evolution-api/.env
```

Ejemplo:

```env
EVOLUTION_DOMAIN=wa.tudominio.com
EVOLUTION_API_KEY=una-clave-larga-y-segura
EVOLUTION_INSTANCE_NAME=clinica

POSTGRES_PASSWORD=otra-clave-larga
REDIS_PASSWORD=otra-clave-larga

EVOLUTION_BATCH_SIZE=25
EVOLUTION_DELAY_MS=4000
```

## 4. Levantar Evolution API

```bash
cd /opt/evolution-api
docker compose up -d
docker compose logs -f evolution-api
```

Cuando el servicio este arriba, configure Nginx y HTTPS:

```bash
cp /root/evolution-api/setup-nginx.sh /opt/evolution-api/setup-nginx.sh
bash /opt/evolution-api/setup-nginx.sh
```

Prueba rapida:

```bash
curl https://wa.tudominio.com
```

## 5. Crear instancia y escanear QR

Use la API para crear la instancia:

```bash
curl -X POST "https://wa.tudominio.com/instance/create" \
  -H "Content-Type: application/json" \
  -H "apikey: una-clave-larga-y-segura" \
  -d '{
    "instanceName": "clinica",
    "qrcode": true,
    "integration": "WHATSAPP-BAILEYS"
  }'
```

Si la respuesta trae QR/base64, escaneelo con WhatsApp del numero de la clinica.

Verificar estado:

```bash
curl "https://wa.tudominio.com/instance/connectionState/clinica" \
  -H "apikey: una-clave-larga-y-segura"
```

Debe responder algo como:

```json
{
  "instance": {
    "state": "open"
  }
}
```

## 6. Configurar Vercel

En Vercel > Project > Settings > Environment Variables:

```env
EVOLUTION_API_URL=https://wa.tudominio.com
EVOLUTION_API_KEY=una-clave-larga-y-segura
EVOLUTION_INSTANCE_NAME=clinica
EVOLUTION_BATCH_SIZE=25
EVOLUTION_DELAY_MS=4000
```

Haga redeploy del proyecto.

## 7. Usar en Clinica Jerusalen

1. Modulo Promociones.
2. Crear campana.
3. Paso 3: elegir `Evolution API`.
4. En pestana `Campanas`, presionar `Verificar conexion`.
5. Si aparece conectado, presionar `Enviar automatico` o `Procesar automaticas`.

## 8. Recomendaciones anti-bloqueo

- No use listas compradas.
- Envie solo a pacientes/contactos autorizados.
- Empiece con 20-25 mensajes por lote.
- Deje pausas de 4 a 10 segundos.
- No envie texto identico a cientos de personas sin variaciones.
- Incluya una frase como: "Si no desea recibir promociones, responda NO".
- Si WhatsApp pide verificar sesion, escanee QR nuevamente.

## 9. Comandos utiles

Ver logs:

```bash
cd /opt/evolution-api
docker compose logs -f evolution-api
```

Reiniciar:

```bash
cd /opt/evolution-api
docker compose restart evolution-api
```

Actualizar imagen:

```bash
cd /opt/evolution-api
docker compose pull
docker compose up -d
```

Respaldar datos:

```bash
cd /opt/evolution-api
docker compose exec postgres pg_dump -U evolution evolution > evolution-backup.sql
```

## 10. Variables que usa la app

La app lee estas variables en Vercel:

- `EVOLUTION_API_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_INSTANCE_NAME`
- `EVOLUTION_BATCH_SIZE`
- `EVOLUTION_DELAY_MS`

Si faltan, el sistema mostrara `Evolution API sin configurar`.
