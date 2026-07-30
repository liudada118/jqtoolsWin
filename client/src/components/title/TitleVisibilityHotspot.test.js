import React, { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import TitleVisibilityHotspot from './TitleVisibilityHotspot'

/**
 * 提供最小状态容器，验证透明热区能够驱动标题显示状态。
 * @returns {JSX.Element} 测试组件。
 */
function HotspotHarness() {
    const [visible, setVisible] = useState(false)
    return (
        <>
            <TitleVisibilityHotspot
                visible={visible}
                onToggle={() => setVisible((currentValue) => !currentValue)}
            />
            {visible ? <div data-testid="test-title">Title</div> : null}
        </>
    )
}

test('透明热区无可见内容并可连续切换标题栏', () => {
    render(<HotspotHarness />)

    const showHotspot = screen.getByRole('button', { name: '显示标题栏' })
    expect(showHotspot).toBeEmptyDOMElement()
    expect(showHotspot).toHaveClass('titleVisibilityHotspot')
    expect(showHotspot).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByTestId('test-title')).not.toBeInTheDocument()

    fireEvent.click(showHotspot)
    const hideHotspot = screen.getByRole('button', { name: '隐藏标题栏' })
    expect(hideHotspot).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('test-title')).toBeInTheDocument()

    fireEvent.click(hideHotspot)
    expect(screen.getByRole('button', { name: '显示标题栏' }))
        .toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByTestId('test-title')).not.toBeInTheDocument()
})
