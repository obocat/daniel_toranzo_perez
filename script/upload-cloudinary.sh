#!/bin/bash
set -euo pipefail

usage() {
    cat <<'EOF'
Sube imágenes a Cloudinary usando una subida firmada.

Uso:
  CLOUDINARY_CLOUD_NAME=... \
  CLOUDINARY_API_KEY=... \
  CLOUDINARY_API_SECRET=... \
  script/upload-cloudinary.sh [--folder blog/attributedstring] <archivo> [...]

Variables:
  CLOUDINARY_CLOUD_NAME  Cloud name de la cuenta.
  CLOUDINARY_API_KEY     API key.
  CLOUDINARY_API_SECRET  API secret. No se imprime ni se pasa por argumentos.
  CLOUDINARY_FOLDER      Carpeta destino. Por defecto: blog/attributedstring.

Salida:
  Una URL secure_url por cada archivo subido.
EOF
}

folder="${CLOUDINARY_FOLDER:-blog/attributedstring}"

while [ "$#" -gt 0 ]; do
    case "$1" in
        -h | --help)
            usage
            exit 0
            ;;
        --folder)
            [ "$#" -ge 2 ] || {
                echo "Falta el valor de --folder." >&2
                exit 1
            }
            folder="$2"
            shift 2
            ;;
        --folder=*)
            folder="${1#--folder=}"
            shift
            ;;
        --)
            shift
            break
            ;;
        -*)
            echo "Opción desconocida: $1" >&2
            usage >&2
            exit 1
            ;;
        *)
            break
            ;;
    esac
done

if [ "$#" -eq 0 ]; then
    echo "Falta al menos un archivo." >&2
    usage >&2
    exit 1
fi

missing=0
for var in CLOUDINARY_CLOUD_NAME CLOUDINARY_API_KEY CLOUDINARY_API_SECRET; do
    if [ -z "${!var:-}" ]; then
        echo "Falta la variable $var." >&2
        missing=1
    fi
done
[ "$missing" -eq 0 ] || exit 1

if ! command -v curl >/dev/null 2>&1; then
    echo "curl es necesario para subir las imágenes." >&2
    exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
    echo "jq es necesario para leer la respuesta de Cloudinary." >&2
    exit 1
fi

for file in "$@"; do
    if [ ! -f "$file" ]; then
        echo "No existe el archivo: $file" >&2
        exit 1
    fi

    timestamp=$(date +%s)
    signature=$(
        printf 'folder=%s&timestamp=%s%s' \
            "$folder" "$timestamp" "$CLOUDINARY_API_SECRET" \
            | shasum -a 1 | awk '{print $1}'
    )

    response=$(
        curl -sS -X POST \
            "https://api.cloudinary.com/v1_1/$CLOUDINARY_CLOUD_NAME/image/upload" \
            -F "file=@$file" \
            -F "api_key=$CLOUDINARY_API_KEY" \
            -F "timestamp=$timestamp" \
            -F "folder=$folder" \
            -F "signature=$signature"
    )

    if ! secure_url=$(printf '%s' "$response" | jq -er '.secure_url'); then
        printf 'Error subiendo %s:\n%s\n' "$file" "$response" >&2
        exit 1
    fi

    printf '%s\n' "$secure_url"
done
