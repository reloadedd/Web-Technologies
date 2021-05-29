FROM mariadb:latest

LABEL author="Ionuț Roșca <ionut.rosca@info.uaic.ro>"
LABEL version="0.3.1"

# Get the arguments passed at *build time* from docker-compose (or docker run --build-arg) if you want it that way
ARG ROOT_PASSWORD
ARG DATABASE_USER
ARG DATABASE_NAME
ARG DATABASE_PASSWORD

# Set environment variables after those build time arguments
ENV UNST_DATABASE_NAME ${DATABASE_NAME}
ENV UNST_DATABASE_USER ${DATABASE_USER}
ENV MARIADB_ROOT_PASSWORD ${ROOT_PASSWORD}
ENV UNST_DATABASE_PASSWORD ${DATABASE_PASSWORD}

COPY ./.docker/mariadb_scripts/*.sh /scripts/
WORKDIR /scripts

# This script will create the user and database
RUN chmod +x first_run.sh && ./first_run.sh

# NOTE: The SQL script will be run by the mariadb container on the first time!
RUN cp create_database.sql /docker-entrypoint-initdb.d/

# This script will change the UID and GID of the 'mysql' user generated by the mariadb such that
# it doesn't conflict with the UID of another user on the production server
RUN chmod +x change_uid.sh && ./change_uid.sh

EXPOSE 3306