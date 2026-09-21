FROM node:22-bookworm-slim
WORKDIR /app
COPY cms/package.json ./
RUN npm install --omit=dev
COPY cms/ ./
COPY site/images ./seed-images
ENV NODE_ENV=production
ENV PORT=80
ENV DATA_DIR=/app/data
ENV SEED_IMAGES_DIR=/app/seed-images
EXPOSE 80
CMD ["node", "--experimental-sqlite", "src/server.js"]
