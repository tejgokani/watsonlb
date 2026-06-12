import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { config } from "../config.js";
import type { JWTPayload } from "@watsonlb/shared";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JWTPayload;
    user: JWTPayload;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authenticateAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  await app.register(jwt, { secret: config.JWT_SECRET });

  app.decorate(
    "authenticate",
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        await req.jwtVerify();
      } catch {
        reply.status(401).send({ error: "Unauthorized" });
      }
    },
  );

  app.decorate(
    "authenticateAdmin",
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        await req.jwtVerify();
        if (!req.user.isAdmin) {
          return reply.status(403).send({ error: "Forbidden" });
        }
      } catch {
        reply.status(401).send({ error: "Unauthorized" });
      }
    },
  );
});
