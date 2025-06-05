import express from "express";
import { userRouter } from "./router/user";
import { generateRouter } from "./router/generate";
import cors from "cors";

console.log("hello from backend")

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/v1/user", userRouter);
app.use("/api/v1/generate", generateRouter);


app.listen(10000, () => {
    console.log("Backend server is listening on port 10000");
});