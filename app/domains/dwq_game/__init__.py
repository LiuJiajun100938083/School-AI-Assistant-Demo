"""
大灣區大亨 (DWQ Tycoon) 多人在線遊戲域

域結構:
    constants.py    # 純配置:CITIES/INDUSTRIES/PROFIT_MATRIX/EVENTS/CONNECTIONS/DECK
    schemas.py      # Pydantic 請求/響應 + WebSocket 訊息 envelopes
    models.py       # @dataclass: Player/Factory/Card/GameState/Room
    exceptions.py   # InvalidActionError/RoomFullError/NotYourTurnError 等
    engine.py       # 純函數遊戲邏輯 (validate_*, do_*, settle_profit, apply_event)
    repository.py   # In-memory store (DwqGameStore + asyncio.Lock)
    ws_manager.py   # DwqWSManager (WebSocket 連線池)
    service.py      # DwqGameService 業務 orchestration 門面

設計原則:
    - Domain-oriented (職責清晰、高內聚低耦合)
    - 服務端權威狀態,所有操作必經 service.handle_action 校驗
    - engine 為純函數,無 I/O 依賴,易單元測試
    - constants 與邏輯分離,改數值不動代碼
    - 玩家身份從 JWT 解析,絕不信任 request body
"""
