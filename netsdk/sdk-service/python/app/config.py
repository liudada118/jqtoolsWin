"""
配置管理模块
用于加载和管理座椅控制系统的配置参数
"""
import copy
from typing import Any, Dict, Optional
from ruamel.yaml import YAML
from ruamel.yaml.comments import CommentedMap


class Config:
    """配置管理类（支持注释保留和读取）"""

    def __init__(self, config_path: str = 'sensor_config.yaml'):
        """
        初始化配置管理器

        Args:
            config_path: 配置文件路径
        """
        self.config_path = config_path
        self.yaml = YAML()
        self.yaml.preserve_quotes = True
        self.yaml.default_flow_style = False
        self._config = self._load_config()
        self._original_config = copy.deepcopy(self._config)

    def _load_config(self) -> CommentedMap:
        """
        加载配置文件（保留注释）

        Returns:
            配置字典（CommentedMap类型，保留注释信息）
        """
        try:
            with open(self.config_path, 'r', encoding='utf-8') as f:
                config = self.yaml.load(f)
            return config
        except FileNotFoundError:
            raise FileNotFoundError(f"配置文件未找到: {self.config_path}")
        except Exception as e:
            raise ValueError(f"配置文件格式错误: {e}")

    def get(self, key_path: str, default: Any = None) -> Any:
        """
        获取配置值，支持嵌套键（用.分隔）

        Args:
            key_path: 配置键路径，如 'lumbar.back_total_threshold'
            default: 默认值

        Returns:
            配置值

        Examples:
            >>> config.get('system.hz')
            13
            >>> config.get('lumbar.airbags')
            [5, 6]
        """
        keys = key_path.split('.')
        value = self._config

        try:
            for key in keys:
                value = value[key]
            return value
        except (KeyError, TypeError):
            return default

    def set(self, key_path: str, value: Any) -> None:
        """
        设置配置值，支持嵌套键（用.分隔）

        Args:
            key_path: 配置键路径，如 'lumbar.back_total_threshold'
            value: 新值

        Examples:
            >>> config.set('lumbar.back_total_threshold', 600)
            >>> config.set('system.hz', 15)
        """
        keys = key_path.split('.')
        target = self._config

        # 遍历到倒数第二个键
        for key in keys[:-1]:
            if key not in target:
                target[key] = {}
            target = target[key]

        # 设置最后一个键的值
        target[keys[-1]] = value

    def reset(self) -> None:
        """重置配置到初始状态"""
        self._config = copy.deepcopy(self._original_config)

    def reload(self) -> None:
        """从文件重新加载配置"""
        self._config = self._load_config()
        self._original_config = copy.deepcopy(self._config)

    def save_to_file(self) -> None:
        """
        将当前配置保存到文件（保留注释）

        Examples:
            >>> config.set('lumbar.back_total_threshold', 600)
            >>> config.save_to_file()  # 持久化到yaml文件，保留注释
        """
        try:
            with open(self.config_path, 'w', encoding='utf-8') as f:
                self.yaml.dump(self._config, f)
        except Exception as e:
            raise IOError(f"保存配置文件失败: {e}")

    def get_all(self) -> Dict[str, Any]:
        """
        获取所有配置

        Returns:
            完整的配置字典
        """
        return copy.deepcopy(self._config)

    def get_comment(self, key_path: str) -> Optional[str]:
        """
        获取指定参数的注释

        Args:
            key_path: 配置键路径，如 'integrated_system.cushion_sum_threshold'

        Returns:
            注释文本（如果存在），否则返回 None

        Examples:
            >>> config.get_comment('integrated_system.cushion_sum_threshold')
            '坐垫压力总和阈值，判定为有人坐下的压力值'
        """
        keys = key_path.split('.')
        obj = self._config

        try:
            # 遍历到目标对象
            for key in keys[:-1]:
                obj = obj[key]

            # 获取最后一个键的注释
            last_key = keys[-1]
            if hasattr(obj, 'ca') and hasattr(obj.ca, 'items'):
                # 获取该键的注释
                comment_token = obj.ca.items.get(last_key)
                if comment_token and len(comment_token) >= 3:
                    # comment_token[2] 是行尾注释
                    if comment_token[2] and comment_token[2].value:
                        return comment_token[2].value.strip().lstrip('#').strip()
            return None
        except (KeyError, TypeError, AttributeError):
            return None

    def get_all_with_comments(self) -> Dict[str, Any]:
        """
        获取所有配置及其注释（扁平化格式）

        Returns:
            字典，格式为：
            {
                'key_path': {
                    'value': 配置值,
                    'comment': 注释文本（可能为None）
                }
            }

        Examples:
            >>> config.get_all_with_comments()
            {
                'system.hz': {'value': 13, 'comment': '采样频率（帧/秒）'},
                'integrated_system.cushion_sum_threshold': {
                    'value': 500.0,
                    'comment': '坐垫压力总和阈值'
                },
                ...
            }
        """
        result = {}
        self._flatten_with_comments(self._config, '', result)
        return result

    def _flatten_with_comments(self, obj: Any, prefix: str, result: Dict[str, Any]):
        """
        递归地扁平化配置并提取注释

        Args:
            obj: 当前对象
            prefix: 当前路径前缀
            result: 结果字典
        """
        if isinstance(obj, dict):
            for key, value in obj.items():
                # 构建完整路径
                full_key = f"{prefix}.{key}" if prefix else key

                # 如果值是字典，递归处理
                if isinstance(value, dict):
                    self._flatten_with_comments(value, full_key, result)
                else:
                    # 获取注释
                    comment = None
                    if hasattr(obj, 'ca') and hasattr(obj.ca, 'items'):
                        comment_token = obj.ca.items.get(key)
                        if comment_token and len(comment_token) >= 3:
                            if comment_token[2] and comment_token[2].value:
                                comment = comment_token[2].value.strip().lstrip('#').strip()

                    # 保存值和注释
                    result[full_key] = {
                        'value': value,
                        'comment': comment
                    }
        elif isinstance(obj, list):
            # 列表不处理注释，直接保存
            result[prefix] = {
                'value': obj,
                'comment': None
            }

    def __getitem__(self, key: str) -> Any:
        """支持字典式访问"""
        return self.get(key)

    def __setitem__(self, key: str, value: Any) -> None:
        """支持字典式设置"""
        self.set(key, value)

    def __repr__(self) -> str:
        return f"Config(config_path='{self.config_path}')"
