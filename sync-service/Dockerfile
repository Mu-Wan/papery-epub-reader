FROM node:22-alpine
WORKDIR /app
COPY server.mjs ./server.mjs
USER node
ENV HOST=0.0.0.0 PORT=8788
EXPOSE 8788
CMD ["node", "server.mjs"]
