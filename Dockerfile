FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/

RUN npm install --workspace=packages/shared --workspace=packages/server

COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/

RUN cd packages/server && npx prisma generate
RUN npm run build -w packages/shared && npm run build -w packages/server

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "packages/server/dist/index.js"]
