const DEFAULT_UI_FPS = 6;

/**
 * 创建共享前端调度器。
 * start() 是幂等的，页面重复挂载不会叠加 requestAnimationFrame 循环。
 *
 * @param {object} options 调度器配置。
 * @param {(callback: FrameRequestCallback) => number} [options.requestFrame] 请求下一帧。
 * @param {(requestId: number) => void} [options.cancelFrame] 取消下一帧。
 * @param {number} [options.uiFps] 普通 React UI 的最高刷新频率。
 * @returns {object} 调度器实例。
 */
export function createScheduler({
    requestFrame = (callback) => requestAnimationFrame(callback),
    cancelFrame = (requestId) => cancelAnimationFrame(requestId),
    uiFps = DEFAULT_UI_FPS,
} = {}) {
    const renderSubs = new Set();
    const uiSubs = new Set();
    const uiIntervalMs = 1000 / uiFps;
    let running = false;
    let animationFrameId = null;
    let lastUiRunAt = Number.NEGATIVE_INFINITY;

    /** 执行一组订阅函数；单个组件报错不能中断整个全局动画循环。 */
    function notifySubscribers(subscribers) {
        subscribers.forEach((subscriber) => {
            try {
                subscriber();
            } catch (error) {
                console.error('[scheduler] subscriber failed:', error);
            }
        });
    }

    /** 执行一帧并继续申请下一帧。 */
    function loop(timestamp) {
        if (!running) return;

        notifySubscribers(renderSubs);
        if (timestamp - lastUiRunAt >= uiIntervalMs) {
            lastUiRunAt = timestamp;
            notifySubscribers(uiSubs);
        }

        animationFrameId = requestFrame(loop);
    }

    return {
        renderSubs,
        uiSubs,

        /** 启动调度器；已经运行时不会创建第二个循环。 */
        start() {
            if (running) return false;
            running = true;
            lastUiRunAt = Number.NEGATIVE_INFINITY;
            animationFrameId = requestFrame(loop);
            return true;
        },

        /** 停止调度器，主要用于测试或应用整体销毁。 */
        stop() {
            if (!running) return false;
            running = false;
            if (animationFrameId !== null) {
                cancelFrame(animationFrameId);
                animationFrameId = null;
            }
            return true;
        },

        /** 返回调度器是否正在运行。 */
        isRunning() {
            return running;
        },

        /** 订阅高频渲染任务。 */
        onRender(subscriber) {
            renderSubs.add(subscriber);
            return () => renderSubs.delete(subscriber);
        },

        /** 订阅低频 React UI 更新任务。 */
        onUI(subscriber) {
            uiSubs.add(subscriber);
            return () => uiSubs.delete(subscriber);
        },
    };
}

export const Scheduler = createScheduler();
