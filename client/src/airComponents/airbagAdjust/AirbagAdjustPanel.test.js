import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import AirbagAdjustPanel from './AirbagAdjustPanel';
import { createDefaultAirbagLayout } from './airbagLayout';

beforeAll(() => {
    window.PointerEvent = window.PointerEvent || MouseEvent;
    window.matchMedia = window.matchMedia || jest.fn().mockImplementation(() => ({
        matches: false,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
    }));
});

test('按住标题栏可以拖动气囊位置面板', () => {
    Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: 1200,
    });
    Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: 900,
    });

    const { container } = render(
        <AirbagAdjustPanel
            layout={createDefaultAirbagLayout()}
            onLayoutChange={jest.fn()}
            open
            onOpenChange={jest.fn()}
            showTrigger={false}
        />
    );
    const panel = container.querySelector('.airbag-adjust-panel');
    const header = container.querySelector('.airbag-adjust-header');
    panel.getBoundingClientRect = () => ({
        left: 720,
        top: 72,
        width: 464,
        height: 700,
        right: 1184,
        bottom: 772,
    });

    fireEvent.pointerDown(header, {
        button: 0,
        pointerId: 7,
        clientX: 750,
        clientY: 90,
    });
    expect(panel).toHaveClass('is-dragging');

    fireEvent.pointerMove(window, {
        pointerId: 7,
        clientX: 300,
        clientY: 200,
    });
    expect(panel).toHaveStyle({ left: '270px', top: '182px' });

    fireEvent.pointerUp(window, { pointerId: 7 });
    expect(panel).not.toHaveClass('is-dragging');
});
