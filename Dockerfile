FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHON_EXECUTABLE=/opt/venv/bin/python \
    HF_HOME=/opt/huggingface \
    PATH="/opt/venv/bin:${PATH}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
    && install -d /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
        -o /tmp/nodesource-repo.gpg.key \
    && gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg /tmp/nodesource-repo.gpg.key \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
        > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* /tmp/nodesource-repo.gpg.key

RUN python -m venv /opt/venv

WORKDIR /app

COPY requirements-svm.txt ./requirements-svm.txt
RUN pip install --no-cache-dir \
    --extra-index-url https://download.pytorch.org/whl/cpu \
    -r requirements-svm.txt \
    && python -c "from transformers import AutoModel, AutoTokenizer; model_id = 'intfloat/multilingual-e5-small'; AutoTokenizer.from_pretrained(model_id); AutoModel.from_pretrained(model_id)"

COPY Backend/package.json Backend/package-lock.json ./Backend/
RUN npm --prefix Backend ci --omit=dev

COPY Backend/ ./Backend/

COPY Frontend/nlp/svm_worker.py \
    Frontend/nlp/predict_svm_batch.py \
    Frontend/nlp/svm_model.py \
    Frontend/nlp/svm_pipeline.py \
    Frontend/nlp/contextual_resolution.py \
    Frontend/nlp/config.py \
    Frontend/nlp/dataset.py \
    Frontend/nlp/validation.py \
    ./Frontend/nlp/
COPY Frontend/nlp/topic_worker.py \
    Frontend/nlp/predict_topics_batch.py \
    Frontend/nlp/topic_applicability.py \
    Frontend/nlp/topic_refinement.py \
    Frontend/nlp/topic_taxonomy.py \
    /app/Frontend/nlp/
RUN set -eu; \
    for module in \
        topic_worker.py \
        predict_topics_batch.py \
        topic_refinement.py \
        topic_applicability.py \
        topic_taxonomy.py; \
    do \
        if [ ! -f "/app/Frontend/nlp/${module}" ]; then \
            echo "Missing topic runtime module: /app/Frontend/nlp/${module}" >&2; \
            exit 1; \
        fi; \
    done; \
    cd /app/Frontend/nlp; \
    python -c "import predict_topics_batch; import topic_refinement; import topic_applicability; import topic_taxonomy"
COPY Frontend/nlp/preprocessing/preprocess.py ./Frontend/nlp/preprocessing/
COPY Frontend/nlp/models/svm_model.joblib ./Frontend/nlp/models/

WORKDIR /app/Backend

CMD ["npm", "start"]
