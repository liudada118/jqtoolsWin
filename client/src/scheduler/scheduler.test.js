import { createScheduler } from './scheduler';

/** 创建可手动推进的 requestAnimationFrame 测试环境。 */
function createFrameHarness() {
    let nextId = 1;
    const callbacks = new Map();

    return {
        requestFrame(callback) {
            const id = nextId++;
            callbacks.set(id, callback);
            return id;
        },
        cancelFrame(id) {
            callbacks.delete(id);
        },
        runNext(timestamp) {
            const entry = callbacks.entries().next().value;
            if (!entry) return false;
            const [id, callback] = entry;
            callbacks.delete(id);
            callback(timestamp);
            return true;
        },
        get pendingCount() {
            return callbacks.size;
        },
    };
}

test('重复启动只保留一个动画循环', () => {
    const frames = createFrameHarness();
    const scheduler = createScheduler({
        requestFrame: frames.requestFrame,
        cancelFrame: frames.cancelFrame,
    });

    expect(scheduler.start()).toBe(true);
    expect(scheduler.start()).toBe(false);
    expect(frames.pendingCount).toBe(1);

    frames.runNext(0);
    expect(frames.pendingCount).toBe(1);
});

test('UI 订阅按时间限频，不受显示器帧数变化影响', () => {
    const frames = createFrameHarness();
    const scheduler = createScheduler({
        requestFrame: frames.requestFrame,
        cancelFrame: frames.cancelFrame,
        uiFps: 5,
    });
    const uiSubscriber = jest.fn();
    scheduler.onUI(uiSubscriber);
    scheduler.start();

    [0, 16, 100, 199, 200, 399, 400].forEach((timestamp) => frames.runNext(timestamp));
    expect(uiSubscriber).toHaveBeenCalledTimes(3);
});

test('停止后取消待执行帧并允许再次启动', () => {
    const frames = createFrameHarness();
    const scheduler = createScheduler({
        requestFrame: frames.requestFrame,
        cancelFrame: frames.cancelFrame,
    });

    scheduler.start();
    expect(scheduler.stop()).toBe(true);
    expect(scheduler.isRunning()).toBe(false);
    expect(frames.pendingCount).toBe(0);
    expect(scheduler.start()).toBe(true);
    expect(frames.pendingCount).toBe(1);
});
