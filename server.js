import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import floodRoute from "./flood.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/flood", floodRoute);

app.get("/", (req, res) => res.send("Flood API Running"));

const PORT = process.env.PORT || 5004;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

