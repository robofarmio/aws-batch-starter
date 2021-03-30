FROM ubuntu:20.04

WORKDIR /usr/src/app
COPY main.sh .

ENTRYPOINT ["/usr/src/app/main.sh"]
