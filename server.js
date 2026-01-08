const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const pdf = require("html-pdf");
const sgMail = require("@sendgrid/mail");

// Importa o banco de dados
const db = require("./database.js");

const app = express();
app.use(cors({ origin: "https://jcfidelisma.github.io" }));
app.use(bodyParser.json());

// Configuração do SendGrid via API
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Rota inicial para teste
app.get("/", (req, res) => {
  res.send("API Proposta Express funcionando!");
});

// Rota para gerar PDF
app.post("/generate-pdf", (req, res) => {
  const { cliente, empresa, valor, descricao } = req.body;

  const htmlContent = `
    <h1 style="color:#2c3e50;">Proposta Comercial</h1>
    <p><strong>Cliente:</strong> ${cliente}</p>
    <p><strong>Empresa:</strong> ${empresa}</p>
    <p><strong>Valor:</strong> R$ ${valor}</p>
    <p><strong>Descrição:</strong> ${descricao}</p>
    <hr>
    <p style="font-size:12px;color:#7f8c8d;">Gerado pelo Proposta Express</p>
  `;

  const options = { format: "A4", border: "10mm" };

  pdf.create(htmlContent, options).toBuffer((err, buffer) => {
    if (err) return res.status(500).send(err);
    res.contentType("application/pdf");
    res.send(buffer);
  });
});

// Rota para enviar e-mail com PDF anexado
app.post("/send-email", async (req, res) => {
  const { to, subject, cliente, empresa, valor, descricao, prazo } = req.body;
  console.log("Dados recebidos:", req.body);

  // Calcula validade automática
  const prazoDias = parseInt(prazo);
  const validade = new Date();
  validade.setDate(validade.getDate() + prazoDias);
  const validadeFormatada = validade.toLocaleDateString("pt-BR");

  // Primeiro salva no banco como "Pendente"
  db.run(
    `INSERT INTO propostas (cliente, empresa, valor, descricao, email, validade, data_envio, status)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)`,
    [cliente, empresa, valor, descricao, to, validadeFormatada, "Pendente"],
    async function(err) {
      if (err) {
        console.error("Erro ao salvar proposta:", err);
        return res.status(500).send("Erro ao salvar proposta");
      }

      const propostaId = this.lastID;

      // Links de confirmação
      const aceitarLink = `https://proposta-express-backend-1.onrender.com/proposta/${propostaId}/aceitar`;
      const recusarLink = `https://proposta-express-backend-1.onrender.com/proposta/${propostaId}/recusar`;

      // Gera o HTML da proposta com botões de confirmação
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; color: #2c3e50; margin: 20px; }
            .header { text-align: center; border-bottom: 2px solid #2980b9; padding-bottom: 10px; margin-bottom: 20px; }
            .header img { max-width: 300px; height: auto; }
            .content h1 { color: #2980b9; }
            .content p { font-size: 14px; margin: 5px 0; }
            .footer { margin-top: 30px; font-size: 12px; color: #7f8c8d; text-align: center; border-top: 1px solid #bdc3c7; padding-top: 10px; }
            .btn { display:inline-block; padding:10px 15px; border-radius:5px; text-decoration:none; color:#fff; margin:5px; }
            .btn-aceitar { background:#27ae60; }
            .btn-recusar { background:#c0392b; }
          </style>
        </head>
        <body>
          <div class="header">
            <img src="https://github.com/jcfidelisma/Proposta-Express/blob/main/logo.png?raw=true" alt="Logo Empresa">
            <h2>Proposta Express</h2>
          </div>
          <div class="content">
            <h1>Proposta Comercial</h1>
            <p><strong>Cliente:</strong> ${cliente}</p>
            <p><strong>Empresa:</strong> ${empresa}</p>
            <p><strong>Valor:</strong> R$ ${valor}</p>
            <p><strong>Descrição:</strong> ${descricao}</p>
            <p><strong>Validade:</strong> até ${validadeFormatada}</p>
            <hr>
            <p>Confirme sua decisão:</p>
            <a href="${aceitarLink}" class="btn btn-aceitar">Aceitar Proposta</a>
            <a href="${recusarLink}" class="btn btn-recusar">Recusar Proposta</a>
          </div>
          <div class="footer">
            <p>Atenciosamente,</p>
            <p><strong>Equipe Proposta Express</strong></p>
            <p>Este documento foi gerado automaticamente pelo sistema.</p>
          </div>
        </body>
        </html>
      `;

      try {
        // Gera o PDF em memória
        const pdfBuffer = await new Promise((resolve, reject) => {
          pdf.create(htmlContent, { format: "A4", border: "10mm" }).toBuffer((err, buffer) => {
            if (err) reject(err);
            else resolve(buffer);
          });
        });

        // Monta e envia e-mail via API SendGrid
        const msg = {
          to,
          from: process.env.EMAIL_FROM,
          subject,
          text: "Segue em anexo a proposta comercial.",
          html: htmlContent,
          attachments: [
            {
              content: pdfBuffer.toString("base64"),
              filename: "proposta.pdf",
              type: "application/pdf",
              disposition: "attachment"
            }
          ]
        };

        await sgMail.send(msg);

        // Atualiza status para "Enviado"
        db.run(`UPDATE propostas SET status = ? WHERE id = ?`, ["Enviado", propostaId]);

        res.send("E-mail com PDF enviado com sucesso!");
      } catch (error) {
        console.error("Erro ao enviar e-mail:", error);

        // Atualiza status para "Falha"
        db.run(`UPDATE propostas SET status = ? WHERE id = ?`, ["Falha", propostaId]);

        res.status(500).send("Erro ao enviar e-mail");
      }
    }
  );
});

// Rotas para aceitar/recusar propostas
app.get("/proposta/:id/aceitar", (req, res) => {
  const id = req.params.id;
  db.run(`UPDATE propostas SET status = ? WHERE id = ?`, ["Aceita", id], (err) => {
    if (err) return res.status(500).send("Erro ao confirmar proposta");
    res.send("✅ Proposta aceita com sucesso!");
  });
});

app.get("/proposta/:id/recusar", (req, res) => {
  const id = req.params.id;
  db.run(`UPDATE propostas SET status = ? WHERE id = ?`, ["Recusada", id], (err) => {
    if (err) return res.status(500).send("Erro ao recusar proposta");
    res.send("❌ Proposta recusada.");
  });
});

// Rota para consultar histórico
app.get("/propostas", (req, res) => {
  db.all("SELECT * FROM propostas ORDER BY data_envio DESC", [], (err, rows) => {
    if (err) return res.status(500).send("Erro ao consultar propostas");
    res.json(rows);
  });
});

// Inicializa servidor com porta dinâmica
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});


