FROM node:22-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json build.mjs server.mjs ./
COPY --chown=node:node src ./src
RUN node build.mjs && mkdir /data && chown node:node /data
USER node
ENV HOST=0.0.0.0 PORT=8080 DATA_DIR=/data
EXPOSE 8080
VOLUME ["/data"]
CMD ["node", "server.mjs"]
