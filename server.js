/**
 * Punto de entrada para BananaHosting / cPanel Node.js
 * Archivo de inicio de la aplicación → server.js
 */
const { createServer } = require('http')
const next = require('next')

const port = parseInt(process.env.PORT || '3000', 10)
const hostname = process.env.HOSTNAME || '0.0.0.0'

const app = next({ dev: false, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      await handle(req, res)
    } catch (err) {
      console.error(err)
      res.statusCode = 500
      res.end('internal server error')
    }
  }).listen(port, hostname, (err) => {
    if (err) throw err
    console.log(`Clinica Jerusalen lista en puerto ${port}`)
  })
})
