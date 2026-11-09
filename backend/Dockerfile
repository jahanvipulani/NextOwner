FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN chmod +x start.sh \
 && useradd --create-home --uid 10001 appuser \
 && mkdir -p /app/uploads && chown -R appuser /app
USER appuser
EXPOSE 8000
CMD ["./start.sh"]
