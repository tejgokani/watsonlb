import fp from "fastify-plugin";
import cors from "@fastify/cors";
import { FastifyInstance } from "fastify";

export const corsPlugin = fp(async (app: FastifyInstance) => {
  const dashboardUrl = process.env["DASHBOARD_URL"];

  const productionOrigins: (string | RegExp)[] = [
    /\.watsonlb\.dev$/,
    "https://watsonlb.dev",
    /\.vercel\.app$/,
  ];
  if (dashboardUrl) productionOrigins.push(dashboardUrl);

  await app.register(cors, {
    origin: process.env["NODE_ENV"] === "production" ? productionOrigins : true,
    credentials: true,
  });
});
