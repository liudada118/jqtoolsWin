// scheduler.js
export const Scheduler = {
    renderSubs: new Set(),
    uiSubs: new Set(),
    frameCount: 0,
    start() {
        const loop = () => {
            
            this.frameCount++;
            // 高频渲染层（Canvas / WebGL）
            this.renderSubs.forEach(fn => fn());

            // 每 10 帧 (~6Hz) 通知 UI 层
            if (this.frameCount % 10 === 0) {
                this.uiSubs.forEach(fn => fn());
            }

            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    },
    onRender(fn) {
        this.renderSubs.add(fn);
        return () => this.renderSubs.delete(fn);
    },
    onUI(fn) {
        this.uiSubs.add(fn);
        return () => this.uiSubs.delete(fn);
    }
};
