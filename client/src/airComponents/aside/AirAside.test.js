import React from 'react';
import { act, render } from '@testing-library/react';
import AirAside from './AirAside';
import { Scheduler } from '../../scheduler/scheduler';
import { AIRBAG_DISPLAY_MODES } from './airAsideDisplayData';

/** 生成含 24 路档位的算法控制帧。 */
function createControlCommand(gears = {}) {
    const command = [31];
    for (let airbagId = 1; airbagId <= 24; airbagId += 1) {
        command.push(airbagId, Number(gears[airbagId]) || 0);
    }
    command.push(0, 0, 170, 85, 3, 153);
    return command;
}

test('区域调节由 title 栏状态控制当前状态和 Python 算法指令', () => {
    const currentGears = new Array(24).fill(0);
    const algorithmCommand = createControlCommand({ 1: 3 });
    const props = {
        algorDataRef: { current: { control_command: algorithmCommand } },
        algorFeed: { current: currentGears },
        airbagFeedbackOnline: { current: true },
        handle: { current: {} },
        controlsMode: { current: 'algor' },
    };
    const { container, rerender } = render(
        <AirAside
            {...props}
            airbagDisplayMode={AIRBAG_DISPLAY_MODES.EFFECTIVE}
        />,
    );

    act(() => {
        Scheduler.uiSubs.forEach((subscriber) => subscriber());
    });

    const firstAirbag = container.querySelector('[data-airbag-id="1"]');

    expect(firstAirbag).toHaveAttribute('data-airbag-gear', '0');
    expect(container).not.toHaveTextContent('算法指令');

    rerender(
        <AirAside
            {...props}
            airbagDisplayMode={AIRBAG_DISPLAY_MODES.ALGORITHM}
        />,
    );

    expect(firstAirbag).toHaveAttribute('data-airbag-gear', '3');
    expect(firstAirbag).toHaveClass('onRectAir');
});
