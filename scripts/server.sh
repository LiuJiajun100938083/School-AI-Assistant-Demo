#!/bin/bash
#
# 校園AI助手 — 伺服器管理腳本
# ==========================================
#
# 用法:
#   ./scripts/server.sh start     啟動（後台運行）
#   ./scripts/server.sh stop      停止
#   ./scripts/server.sh restart   重啟
#   ./scripts/server.sh status    查看狀態
#   ./scripts/server.sh logs      跟蹤日誌（tail -f）
#   ./scripts/server.sh logs 100  查看最後 100 行
#

set -euo pipefail

# ── 配置 ──
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$PROJECT_DIR/.server.pid"
LOG_DIR="$PROJECT_DIR/logs"
STDOUT_LOG="$LOG_DIR/server_stdout.log"
STDERR_LOG="$LOG_DIR/server_stderr.log"

# Python 解釋器（優先用 conda/venv 環境）
if [ -n "${CONDA_PREFIX:-}" ]; then
    PYTHON="$CONDA_PREFIX/bin/python"
elif [ -f "$PROJECT_DIR/.venv/bin/python" ]; then
    PYTHON="$PROJECT_DIR/.venv/bin/python"
else
    PYTHON="python3"
fi

# 確保日誌目錄存在
mkdir -p "$LOG_DIR"

# ── 函數 ──

get_pid() {
    if [ -f "$PID_FILE" ]; then
        local pid
        pid=$(cat "$PID_FILE" 2>/dev/null)
        # 驗證進程是否真的在運行
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            echo "$pid"
            return 0
        fi
        # PID 文件過時，清理
        rm -f "$PID_FILE"
    fi
    return 1
}

do_start() {
    if pid=$(get_pid); then
        echo "⚠️  伺服器已在運行 (PID: $pid)"
        echo "   如需重啟，請用: $0 restart"
        return 1
    fi

    echo "🚀 啟動伺服器..."
    echo "   項目目錄: $PROJECT_DIR"
    echo "   Python:   $PYTHON"
    echo "   日誌:     $STDOUT_LOG"

    cd "$PROJECT_DIR"

    # 日誌輪轉：如果超過 50MB，備份舊的
    for logfile in "$STDOUT_LOG" "$STDERR_LOG"; do
        if [ -f "$logfile" ] && [ "$(stat -f%z "$logfile" 2>/dev/null || stat -c%s "$logfile" 2>/dev/null)" -gt 52428800 ] 2>/dev/null; then
            mv "$logfile" "${logfile}.$(date +%Y%m%d_%H%M%S).bak"
            echo "   已輪轉: $(basename "$logfile")"
        fi
    done

    # 後台啟動 uvicorn
    nohup "$PYTHON" -m app.main \
        >> "$STDOUT_LOG" 2>> "$STDERR_LOG" &

    local new_pid=$!
    echo "$new_pid" > "$PID_FILE"

    # 等待 2 秒確認啟動成功
    sleep 2
    if kill -0 "$new_pid" 2>/dev/null; then
        echo "✅ 伺服器已啟動 (PID: $new_pid)"
        echo ""
        echo "   查看日誌: $0 logs"
        echo "   停止服務: $0 stop"
    else
        echo "❌ 伺服器啟動失敗！查看錯誤日誌:"
        echo "   tail -20 $STDERR_LOG"
        rm -f "$PID_FILE"
        return 1
    fi
}

do_stop() {
    if ! pid=$(get_pid); then
        echo "ℹ️  伺服器未在運行"
        return 0
    fi

    echo "⏹️  停止伺服器 (PID: $pid)..."

    # 優雅停止（SIGTERM），等待最多 10 秒
    kill "$pid" 2>/dev/null
    local count=0
    while kill -0 "$pid" 2>/dev/null && [ $count -lt 10 ]; do
        sleep 1
        count=$((count + 1))
        printf "."
    done
    echo ""

    # 如果還沒停，強制終止
    if kill -0 "$pid" 2>/dev/null; then
        echo "   強制終止..."
        kill -9 "$pid" 2>/dev/null
        sleep 1
    fi

    rm -f "$PID_FILE"
    echo "✅ 伺服器已停止"
}

do_restart() {
    do_stop
    sleep 1
    do_start
}

do_status() {
    if pid=$(get_pid); then
        echo "✅ 伺服器運行中 (PID: $pid)"
        echo ""
        # 顯示進程資訊
        ps -p "$pid" -o pid,ppid,%cpu,%mem,etime,command 2>/dev/null | head -2
        echo ""
        # 顯示最後 5 行日誌
        if [ -f "$STDOUT_LOG" ]; then
            echo "── 最近日誌 ──"
            tail -5 "$STDOUT_LOG"
        fi
    else
        echo "❌ 伺服器未在運行"
        echo ""
        echo "   啟動: $0 start"
        # 如果有錯誤日誌，顯示最後幾行
        if [ -f "$STDERR_LOG" ] && [ -s "$STDERR_LOG" ]; then
            echo ""
            echo "── 最後錯誤 ──"
            tail -5 "$STDERR_LOG"
        fi
    fi
}

do_logs() {
    local lines="${1:-}"

    if [ -n "$lines" ]; then
        # 指定行數：顯示最後 N 行
        echo "── 最後 $lines 行（$STDOUT_LOG）──"
        tail -"$lines" "$STDOUT_LOG" 2>/dev/null
    else
        # 無參數：tail -f 跟蹤
        echo "── 跟蹤伺服器日誌（Ctrl+C 退出）──"
        echo "   文件: $STDOUT_LOG"
        echo ""
        tail -f "$STDOUT_LOG" 2>/dev/null
    fi
}

# ── 主入口 ──
case "${1:-}" in
    start)   do_start ;;
    stop)    do_stop ;;
    restart) do_restart ;;
    status)  do_status ;;
    logs)    do_logs "${2:-}" ;;
    *)
        echo "校園AI助手 — 伺服器管理"
        echo ""
        echo "用法: $0 {start|stop|restart|status|logs [N]}"
        echo ""
        echo "  start     啟動伺服器（後台運行）"
        echo "  stop      停止伺服器（優雅關閉）"
        echo "  restart   重啟伺服器"
        echo "  status    查看運行狀態"
        echo "  logs      跟蹤日誌輸出 (tail -f)"
        echo "  logs 100  查看最後 100 行日誌"
        ;;
esac
