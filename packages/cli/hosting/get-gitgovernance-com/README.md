# GitGovernance CLI Installer - Cloudflare Pages

Este directorio contiene los archivos para hospedar el installer de GitGovernance CLI en Cloudflare Pages.

## 🚀 Setup Rápido en Cloudflare Pages

### 1. Crear el sitio en Cloudflare Pages

1. Ve a [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navega a **Pages** → **Create a project**
3. Conecta tu repositorio GitHub
4. Configura:
   - **Project name**: `get-gitgovernance-com`
   - **Production branch**: `main`
   - **Build output directory**: `packages/cli/hosting/get-gitgovernance-com`
   - **Root directory**: `packages/cli/hosting/get-gitgovernance-com`

### 2. Configurar Custom Domain

1. En **Pages** → tu proyecto → **Custom domains**
2. Agregar: `get.gitgovernance.com`
3. Cloudflare configurará automáticamente:
   - SSL/TLS certificate
   - DNS records
   - CDN global

### 3. Testing Local

```bash
# Servir localmente para testing
cd packages/cli/hosting/get-gitgovernance-com
python3 -m http.server 8000

# Test del installer
curl -sSL http://localhost:8000/get-gitgovernance.sh | sh
```

## 📁 Archivos

- `index.html` - Landing page con diseño atractivo
- `get-gitgovernance.sh` - Script de instalación
- `_headers` - Headers de seguridad para Cloudflare
- `README.md` - Esta documentación

## 🎯 URL Final

Una vez configurado:

```bash
curl -sSL https://get.gitgovernance.com | sh
```

## ⚡ Beneficios de Cloudflare Pages

- ✅ **Gratuito** - Sin costo para sitios estáticos
- ✅ **SSL automático** - HTTPS out of the box
- ✅ **CDN global** - Performance mundial
- ✅ **Auto-deploy** - Deploy automático desde Git
- ✅ **Custom domain** - get.gitgovernance.com
- ✅ **Analytics** - Métricas de uso gratuitas
