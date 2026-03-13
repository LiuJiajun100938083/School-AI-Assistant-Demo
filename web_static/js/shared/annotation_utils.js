/**
 * Shared annotation utilities for teacher and student classroom pages.
 *
 * Handles:
 *  - Embedding _canvasRef (reference dimensions) into Fabric JSON
 *  - Loading annotations with automatic proportional scaling
 *  - Scaling Fabric objects when canvas dimensions change
 *
 * _canvasRef is the single source of truth for coordinate reference —
 * annotations are stored in absolute pixels relative to this size.
 */
const AnnotationUtils = {

    /**
     * Scale all Fabric.js objects on a canvas by (scaleX, scaleY).
     * Handles left/top position + object scaleX/scaleY.
     * Supported: PencilBrush paths, lines, rects, circles, text.
     */
    scaleObjects(canvas, scaleX, scaleY) {
        if (!canvas) return;
        canvas.getObjects().forEach(obj => {
            obj.set({
                left: obj.left * scaleX,
                top: obj.top * scaleY,
                scaleX: obj.scaleX * scaleX,
                scaleY: obj.scaleY * scaleY,
            });
            obj.setCoords();
        });
    },

    /**
     * Capture canvas state as Fabric JSON with embedded _canvasRef.
     * _canvasRef records the canvas dimensions at capture time so
     * the receiving side can scale if its canvas is a different size.
     *
     * @param {fabric.Canvas} canvas
     * @returns {object} Fabric JSON with _canvasRef
     */
    embedCanvasRef(canvas) {
        const json = canvas.toJSON();
        json._canvasRef = {
            width: canvas.getWidth(),
            height: canvas.getHeight(),
        };
        return json;
    },

    /**
     * Load annotations JSON onto a Fabric canvas, automatically scaling
     * if the canvas dimensions differ from the stored _canvasRef.
     *
     * @param {fabric.Canvas} canvas - target canvas
     * @param {string|object|null} annotationsJson - Fabric JSON (string or parsed)
     * @returns {Promise<void>}
     */
    loadAndScale(canvas, annotationsJson) {
        return new Promise((resolve) => {
            if (!canvas) { resolve(); return; }
            if (!annotationsJson) {
                canvas.clear();
                canvas.renderAll();
                resolve();
                return;
            }

            let parsed;
            try {
                parsed = typeof annotationsJson === 'string'
                    ? JSON.parse(annotationsJson)
                    : annotationsJson;
            } catch (e) {
                console.error('[AnnotationUtils] Failed to parse annotations:', e);
                resolve();
                return;
            }

            const ref = parsed._canvasRef;

            canvas.loadFromJSON(parsed, () => {
                // Scale objects if reference size differs from current canvas
                if (ref && ref.width > 0 && ref.height > 0) {
                    const cw = canvas.getWidth();
                    const ch = canvas.getHeight();
                    if (cw > 0 && ch > 0 &&
                        (Math.abs(cw - ref.width) > 1 || Math.abs(ch - ref.height) > 1)) {
                        AnnotationUtils.scaleObjects(canvas, cw / ref.width, ch / ref.height);
                    }
                }
                canvas.renderAll();
                resolve();
            });
        });
    },
};
