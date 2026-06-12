import fp from "fastify-plugin";
import compress from "@fastify/compress";
import { FastifyInstance } from "fastify";

export const compressPlugin = fp(async (app: FastifyInstance) => {
  await app.register(compress, {
    global: true,
    // Skip compression for proxy routes — backend already controls content-encoding
    // and we're streaming the body directly. Compress only API routes.
    encodings: ["gzip", "deflate"],
    threshold: 1024, // only compress responses > 1KB
  });
});
