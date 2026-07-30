import React from 'react'
import './index.scss'

/**
 * 渲染右上角不可见点击热区，用于切换完整标题栏。
 * @param {{visible: boolean, onToggle: () => void}} props 组件属性。
 * @returns {JSX.Element} 不带可见内容的原生按钮。
 */
function TitleVisibilityHotspot({ visible, onToggle }) {
    return (
        <button
            type="button"
            className="titleVisibilityHotspot"
            aria-label={visible ? '隐藏标题栏' : '显示标题栏'}
            aria-pressed={visible}
            onClick={onToggle}
        />
    )
}

export default TitleVisibilityHotspot
