#!/bin/bash
cd "$(dirname "$0")"
exec ./launch-test.sh --fresh "$@"
