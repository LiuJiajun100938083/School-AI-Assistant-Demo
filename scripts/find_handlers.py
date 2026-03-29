"""Find all inline event handlers and scripts in HTML."""
import sys, io, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

HTML_PATH = r"C:\Users\15821\School-AI-Assistant-Demo\web_static\ai_learning_center.html"
with open(HTML_PATH, "r", encoding="utf-8") as f:
    html = f.read()

# Find ALL on* event handlers (both quote styles)
pat = re.compile(r'\b(on\w+)\s*=\s*"([^"]*)"')
for i, line in enumerate(html.split("\n"), 1):
    for m in pat.finditer(line):
        attr, val = m.group(1), m.group(2)
        if attr.startswith("on") and len(attr) <= 15:
            print(f"Line {i}: {attr} len={len(val)}: {val[:80]}")

# Also single-quote version
pat2 = re.compile(r"\b(on\w+)\s*=\s*'([^']*)'")
for i, line in enumerate(html.split("\n"), 1):
    for m in pat2.finditer(line):
        attr, val = m.group(1), m.group(2)
        if attr.startswith("on") and len(attr) <= 15:
            print(f"Line {i}: {attr} (single-quoted) len={len(val)}: {val[:80]}")

# Find inline script content
print("\n--- Inline scripts ---")
pat3 = re.compile(r"<script(?:\s[^>]*)?>(.+?)</script>", re.DOTALL)
for m in pat3.finditer(html):
    content = m.group(1).strip()
    line_num = html[:m.start()].count("\n") + 1
    if content:
        # Check what's at column 48
        first_line = content.split("\n")[0]
        col48 = repr(first_line[47]) if len(first_line) >= 48 else "N/A"
        print(f"Line {line_num}: len={len(content)}, col48={col48}")
        print(f"  Content: {first_line[:100]}")
