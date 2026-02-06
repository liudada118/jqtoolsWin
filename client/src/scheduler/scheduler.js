// scheduler.js
export const Scheduler = {
    renderSubs: new Set(),
    uiSubs: new Set(),
    frameCount: 0,
    started: false,
    start() {
        if (this.started) return;
        this.started = true;
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
        this.start();
        this.renderSubs.add(fn);
        return () => this.renderSubs.delete(fn);
    },
    onUI(fn) {
        this.start();
        this.uiSubs.add(fn);
        return () => this.uiSubs.delete(fn);
    }
};
