#!/bin/bash

echo "Getting logs..."

# Get logs, filter for timestamp lines, sort by timestamp, and format output
beamup logs | \
grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}' | \
sort -k1,1 | \
sed -E 's/^([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]+)Z[[:space:]]*\|[[:space:]]*(.*)/\1                          \2/' | \
sed 's/[[:space:]]*$//'

echo "Done."
