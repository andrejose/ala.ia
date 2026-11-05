// Importação das bibliotecas necessárias
import express from "express";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Configuração das dependências para o servidor web
dotenv.config();

// Configuração do express
const app = express();

// Representatividade
app.use(express.json());

// Configuração do supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY);


app.post("/clients", async (req, res) => {
    // Captura os dados que vêm no body da requisição
    const { name, birth_date, course } = req.body;

    // Inserção dos dados no banco
    const { data, error } = await supabase.from("clients").insert([{ name, birth_date, course }]);

    if (error) return res.status(400).json({ error: error.message });

    res.status(201).json({ message: "Cliente cadastrado com sucesso!" });

});


app.get("/clients", async (req, res) => {

    const { data, error } = await supabase.from("clients").select("*");
    
    if (error) return res.status(400).json({ error: error.message });

    res.status(200).json(data);

});


app.listen(3001, () => {
    console.log("Servidor rodando na porta 3000.");
});

