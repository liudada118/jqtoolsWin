import React, { useCallback, useEffect, useState } from 'react'
import './index.scss'
import { message } from 'antd'
import {
    getCarAdaptiveCollectionState,
    startCarAdaptiveCollection,
    stopCarAdaptiveCollection,
} from '../../util/carAdaptiveCollection'

export default function Col(props) {
    const { colName, setStartTime, col, setCol, sensorId = 1 } = props
    const [pending, setPending] = useState(false)

    /** 把后端全局采集状态同步到主界面按钮。 */
    const applyCollectionState = useCallback((state) => {
        setCol(Boolean(state?.collecting))
        setStartTime(state?.collecting ? Number(state.startedAt) || Date.now() : 0)
    }, [setCol, setStartTime])

    useEffect(() => {
        let disposed = false
        getCarAdaptiveCollectionState()
            .then((state) => {
                if (!disposed) applyCollectionState(state)
            })
            .catch(() => {})
        return () => {
            disposed = true
        }
    }, [applyCollectionState])

    /** 开始或停止一次全局真实串口采集。 */
    const colButtonClick = async () => {
        if (pending) return
        setPending(true)
        try {
            if (!col) {
                const state = await startCarAdaptiveCollection({
                    sensorId,
                    fileName: colName || undefined,
                })
                applyCollectionState(state)
                message.success(`开始采集${Number(state.sensorId) === 2 ? '副驾' : '主驾'}数据`)
            } else {
                const state = await stopCarAdaptiveCollection()
                applyCollectionState(state)
                message.success(`采集已保存，共 ${Number(state.frameCount) || 0} 帧`)
            }
        } catch (error) {
            message.error(error.message || '采集失败')
        } finally {
            setPending(false)
        }
    }

    return (
        <button
            type='button'
            className={`colContent ${pending ? 'isPending' : ''}`}
            onClick={colButtonClick}
            disabled={pending}
            aria-label={col ? '停止采集' : '开始采集'}
            title={col ? '停止并保存采集数据' : '开始采集当前主副驾数据'}
        >
            <div className={`${col ? "colIngIcon" : 'colInitIcon'} colIcon`}></div>
        </button>
    )
}
