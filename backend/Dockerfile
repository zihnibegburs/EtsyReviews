FROM gradle:8.5-jdk21 AS builder

WORKDIR /app

# Copy Gradle wrapper and config files first for caching
COPY gradle gradle
COPY gradlew gradlew.bat ./
COPY build.gradle settings.gradle ./

# Download dependencies (cached layer)
RUN ./gradlew dependencies --no-daemon || true

# Copy source code
COPY src src

# Build application
RUN ./gradlew clean build -x test --no-daemon --stacktrace

FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

# Copy JAR from builder
COPY --from=builder /app/build/libs/*.jar app.jar

EXPOSE 8081

# Run application
ENTRYPOINT ["java", "-Xmx512m", "-jar", "app.jar"]

