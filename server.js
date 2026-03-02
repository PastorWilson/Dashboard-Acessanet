import express from "express";
import fetch from "node-fetch";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

/* ================= APP ================= */

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

app.use(cors());

/* ================= CONFIG ================= */

const API_URL = "https://acessanet.sgp.net.br/api/ura/ocorrencia/list/";
const api_tec = "https://acessanet.sgp.net.br/api/ura/tecnicos/"
const api_venda = "https://acessanet.sgp.net.br/api/precadastro/vendedor/list"
const api_cliente_ativo = "https://acessanet.sgp.net.br/api/ura/listacliente/"


const username = "alexandrecarlos";
const password = "Dead_007";

const basicAuth = Buffer
  .from(`${username}:${password}`)
  .toString("base64");

const CONFIG = {
  token: "68834e4e8e904fb4ab6e7776324e7958",
  app: "noc",
  limit: 500,
  status: 0
};

/* ================= CACHE1================= */

let cache = [];
let lastHash = "";
let ultimaBusca = null;

/* ================= UTILS ================= */

function hashDados(data) {

  return JSON.stringify(
    data
      .map(i => ({
        id: i.id,
        status: i.status,
        tipo: i.tipo,
        data_finalizacao: i.data_finalizacao
      }))
      .sort((a, b) => a.id - b.id)
  );
}

/* ================= BUSCA COMPLETA ================= */

async function buscarTodas() {

  let offset = 0;
  let todas = [];
  let total = Infinity;

  while (todas.length < total) {

    const body = {
      ...CONFIG,
      offset
    };

    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const data = await res.json();

    if (!data.ocorrencias || !data.paginacao) break;

    total = data.paginacao.total;

    todas.push(...data.ocorrencias);

    offset += CONFIG.limit;
  }

  return todas;
}

/* ================= AGRUPAR ================= */

function agrupar(lista) {

  const grupos = {};

  lista.forEach(item => {

    const tipo = item.tipo
      ?.trim()
      .toUpperCase() || "OUTROS";

    if (!grupos[tipo]) grupos[tipo] = 0;

    grupos[tipo]++;
  });

  return grupos;
}

/* ================= BUSCA DELTA ================= */

async function buscarNovos() {

  if (!ultimaBusca) return;

  const body = {
    ...CONFIG,
    data_cadastro_inicio: ultimaBusca
  };

  try {

    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });


    const data = await res.json();

    if (!data.ocorrencias?.length) return;

    console.log("⚡ Novos:", data.ocorrencias.length);

    const novos = data.ocorrencias.filter(n =>
      !cache.find(c => c.id === n.id)
    );

    if (!novos.length) return;

    cache.push(...novos);

    atualizarCache(cache);


  } catch (e) {
    console.error("Erro delta:", e.message);
  }
}

/* ================= ATUALIZAR CACHE ================= */

function atualizarCache(dados) {

  const hash = hashDados(dados);

  if (hash === lastHash) return;

  cache = dados;
  lastHash = hash;

  ultimaBusca = new Date().toISOString();

  const grupos = agrupar(cache);

  io.emit("update", {
    total: cache.length,
    grupos,
    atualizado: Date.now()
  });

  console.log("📡 Atualizado | Total:", cache.length);
}

/* ================= FULL REFRESH ================= */

async function atualizarTudo() {

  try {

    console.log("🔄 Atualização completa");

    const dados = await buscarTodas();

    atualizarCache(dados);

  } catch (e) {
    console.error("Erro full:", e.message);
  }
}

/* ================= SOCKET ================= */

io.on("connection", socket => {

  console.log("🟢 Cliente conectado");

  if (cache.length) {

    socket.emit("update", {
      total: cache.length,
      grupos: agrupar(cache),
      atualizado: Date.now()
    });
  }

  socket.on("disconnect", () => {
    console.log("🔴 Cliente saiu");
  });
});

/* ================= START ================= */

(async () => {

  // Primeira carga
  await atualizarTudo();

  // Delta (rápido)
  setInterval(buscarNovos, 5000);


  // Full refresh (segurança)
  setInterval(atualizarTudo, 60000);

  server.listen(5000, () => {
    console.log("🚀 Server realtime: http://localhost:5000");
  });

})();

async function buscarTécnico() {
  try {
    const res = await fetch(api_tec, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    })
    if (!res.ok) {
      throw new Error(`Erro HTTP: ${res.status}`);
    }
    const data = await res.json();
  }
  catch (e) {

  }
}


async function buscarCliente() {

  try {

    const res = await fetch(api_cliente_ativo, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json"
      },

    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    // Garante que é um array
    if (!Array.isArray(data)) {
      console.log("⚠️ Resposta inválida da API de clientes");
      return;
    }
    const totalClientes = data.length;
    console.log(totalClientes)

    // Envia para o frontend
    io.emit("clientes", {
      total: totalClientes,
      atualizado: Date.now()
    });

  } catch (e) {
    console.error("❌ Erro ao buscar clientes:", e.message);

  }
}
