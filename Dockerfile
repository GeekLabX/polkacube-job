FROM node:12.13.0-alpine
WORKDIR /src
COPY . .
RUN apk update && apk add tzdata \
&& ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
&& echo "Asia/Shanghai" > /etc/timezone \
&& npm install yarn pm2 -g 
RUN echo "\n" |yarn install
VOLUME ["/root/.pm2/logs"]
ENTRYPOINT ["pm2", "start", "index.js", "--name", "cube-job", "--no-daemon", "--restart-delay", "10000"]
