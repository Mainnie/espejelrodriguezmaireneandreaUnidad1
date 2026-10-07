# Mainnie's Beauty

Proyecto demostrativo organizado para editar en Visual Studio Code. Incluye catálogo, filtros de marca y búsqueda, carrito, pedidos de prueba, API con Node.js y una configuración opcional con Docker/Caddy.

> El checkout no cobra. No introduzcas información personal o tarjetas reales. Los pedidos ficticios guardan nombre y dirección en `data/orders.json`.

## Estructura

```text
mainnies-beauty/
├── public/
│   ├── index.html        # Estructura de la página
│   ├── css/styles.css    # Estilos
│   └── js/app.js         # Interacciones y llamadas a la API
├── catalog/products.json # Catálogo administrado por el servidor
├── data/                 # Aquí se crea orders.json al pedir
├── server.js             # Servidor Node.js y endpoints API
├── package.json
├── Dockerfile
├── compose.yaml
└── Caddyfile
```

## Abrir en VS Code

1. Descarga `Mainnies-Beauty-proyecto.zip` y elige **Extraer todo**.
2. Abre Visual Studio Code y selecciona **Archivo > Abrir carpeta**.
3. Selecciona la carpeta extraída `mainnies-beauty` completa.
4. Abre **Terminal > Nueva terminal**. La terminal debe estar ubicada en la carpeta del proyecto.

## Ejecutar con Node.js

Instala Node.js 20 o una versión posterior. En la terminal de VS Code ejecuta:

```powershell
node --version
npm start
```

Abre `http://localhost:3000`. Para detener el servidor, vuelve a la terminal y presiona `Ctrl+C`.

### API

- `GET /api/products`: entrega los 18 productos de `catalog/products.json`.
- `POST /api/orders`: valida el nombre, dirección, productos y cantidades; calcula el total con los precios del servidor y guarda un pedido de demostración.

El total del pedido se calcula en el backend, no se acepta el precio que envía el navegador. El backend no recibe números de tarjeta. Borra `data/orders.json` cuando quieras eliminar los pedidos ficticios.

## Ejecutar con Docker

Instala Docker Desktop y espera a que aparezca como iniciado. Desde la terminal, ubicada en el proyecto, ejecuta:

```powershell
docker compose up --build
```

Abre `https://localhost:8443`. Caddy crea aquí un certificado local para pruebas. El navegador puede mostrar un aviso porque esa autoridad certificadora local no es una autoridad pública. Para detener los contenedores presiona `Ctrl+C` y ejecuta `docker compose down`.

## Certificado al publicar

Docker por sí solo no emite certificados públicos. Para obtener HTTPS confiable en internet se necesita un dominio propio apuntado al servidor, accesibilidad de los puertos 80 y 443 y configurar Caddy con ese dominio; Caddy puede solicitar y renovar un certificado público automáticamente. La página no inventa ni muestra datos del certificado: puedes revisar el certificado activo desde el indicador de conexión del navegador. Una ficha de certificado dentro del sitio requerirá obtener sus datos reales del servidor desplegado.

## Qué puedes modificar

- Cambia textos y elementos de la página en `public/index.html`.
- Cambia colores, espacios y diseño en `public/css/styles.css`.
- Cambia filtros, carrito y checkout en `public/js/app.js`.
- Edita nombres, marcas, descripciones y precios en `catalog/products.json`.
- Cambia rutas y validaciones del backend en `server.js`.

Después de cambiar archivos, actualiza el navegador. Si usas Docker y cambias el servidor o catálogo, reconstruye con `docker compose up --build`.
