FROM node:22-alpine
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --chown=node:node package.json server.js ./
COPY --chown=node:node catalog ./catalog
COPY --chown=node:node public ./public
COPY --chown=node:node img ./img
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "server.js"]
