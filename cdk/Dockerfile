FROM node:14-buster-slim

USER 1000
RUN mkdir /home/node/app && chown node:node -R /home/node/app
WORKDIR /home/node/app

COPY --chown=node:node .npmrc /home/node/.npmrc
COPY --chown=node:node package*.json ./

RUN npm ci

COPY --chown=node:node . .

RUN npm run build
