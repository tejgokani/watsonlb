import fp from "fastify-plugin";
import cors from "@fastify/cors";
import { FastifyInstance } from "fastify";

export const corsPlugin = fp(async (app: FastifyInstance) => {
  await app.register(cors, {
    origin:
      process.env["NODE_ENV"] === "production"
        ? ["https://watsonlb.dev", /\.watsonlb\.dev$/]
        : true,
    credentials: true,
  });
});
