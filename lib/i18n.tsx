"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";

export type Locale = "zh" | "en";

const translations: Record<Locale, Record<string, string>> = {
  zh: {
    // layout
    "site.title": "OpenClaw Bot Dashboard",
    "site.desc": "查看所有 OpenClaw 机器人配置",

    // nav sidebar
    "nav.overview": "总览",
    "nav.agents": "机器人",
    "nav.models": "模型列表",
    "nav.monitor": "监控",
    "nav.sessions": "会话列表",
    "nav.stats": "消息统计",
    "nav.pixelOffice": "像素办公室",
    "nav.config": "配置",
    "nav.skills": "技能管理",
    "nav.alerts": "告警中心",

    // alerts page
    "alerts.title": "告警中心",
    "alerts.subtitle": "配置系统告警和通知",
    "alerts.enableAlerts": "启用告警",
    "alerts.enableDesc": "开启/关闭所有告警通知",
    "alerts.receiveAgent": "接收告警的机器人",
    "alerts.rules": "告警规则",
    "alerts.rulesDesc": "配置哪些条件会触发告警",
    "alerts.triggered": "告警触发 ({count})",
    "alerts.checking": "正在检查告警...",
    "alerts.checkNow": "立即检查",
    "alerts.checkInterval": "检查间隔",

    // common
    "common.loading": "加载中...",
    "common.loadError": "加载失败",
    "common.backHome": "← 返回首页",
    "common.backOverview": "← 返回总览",
    "common.noData": "暂无数据",
    "common.test": "🧪 测试",
    "common.testing": "⏳ 测试中...",
    "common.justNow": "刚刚",
    "common.minutesAgo": "分钟前",
    "common.hoursAgo": "小时前",
    "common.daysAgo": "天前",
    "common.manualRefresh": "手动刷新",
    "common.seconds": "秒",
    "common.minute": "分钟",
    "common.minutes": "分钟",

    // home page
    "home.title": "🐾 OpenClaw Bot Dashboard",
    "home.agentCount": "个机器人",
    "home.pageTitle": "OpenClaw 机器人",
    "home.defaultModel": "默认模型",
    "home.viewModels": "查看模型列表 →",
    "home.skillMgmt": "🧩 技能管理",
    "home.testAll": "🧪 测试绑定的模型",
    "home.testingAll": "⏳ 测试中...",
    "home.testOk": "正常",
    "home.testFail": "异常",
    "home.updatedAt": "更新于",
    "home.refreshManual": "🔄 手动刷新",
    "home.globalTrend": "📊 全局统计趋势",
    "home.totalInputToken": "总 Input Token",
    "home.totalOutputToken": "总 Output Token",
    "home.totalMessages": "总消息数",
    "home.tokenTrend": "🔢 Token 消耗趋势",
    "home.avgResponseTrend": "⏱️ 平均响应时间趋势",
    "home.groupTopology": "💬 群聊拓扑",
    "home.fallbackModels": "🔄 Fallback 模型",
    "home.feishuGroup": "飞书群",
    "home.discordChannel": "Discord 频道",
    "home.bots": "个机器人",
    "home.noResponseData": "暂无响应时间数据",
    "home.testPlatforms": "🧪 测试平台连通",
    "home.testingPlatforms": "⏳ 测试平台中...",
    "home.testSessions": "🔌 测试 Agent",
    "home.testingSessions": "⏳ 测试中...",

    // agent card
    "agent.model": "模型",
    "agent.platform": "平台",
    "agent.feishuAppId": "飞书 App ID",
    "agent.sessionCount": "会话数",
    "agent.messageCount": "消息数",
    "agent.tokenUsage": "Token 用量",
    "agent.totalTokenTip": "总 Token 使用量",
    "agent.stats": "统计",
    "agent.lastActive": "最近活跃",
    "agent.todayAvgResponse": "平均响应",
    "agent.todayAvgResponseTip": "今日平均响应时间",

    // agent status
    "agent.status.working": "工作中",
    "agent.status.online": "在线",
    "agent.status.idle": "空闲",
    "agent.status.offline": "离线",
    "agent.inUse": "使用中:",
    "agent.openChat": "点击打开聊天页面",

    // platform
    "platform.feishu": "📱 飞书",
    "platform.discord": "🎮 Discord",

    // time range
    "range.daily": "按天",
    "range.weekly": "按周",
    "range.monthly": "按月",

    // refresh options
    "refresh.manual": "手动刷新",
    "refresh.10s": "10 秒",
    "refresh.30s": "30 秒",
    "refresh.1m": "1 分钟",
    "refresh.5m": "5 分钟",
    "refresh.10m": "10 分钟",

    // models page
    "models.title": "OpenClaw接入模型列表",
    "models.providerCount": "个 Provider",
    "models.totalPrefix": "共",
    "models.testAll": "🧪 测试全部模型",
    "models.testingAll": "⏳ 测试中...",
    "models.colModelId": "模型 ID",
    "models.colName": "名称",
    "models.colContext": "上下文窗口",
    "models.colMaxOutput": "最大输出",
    "models.colInputType": "输入类型",
    "models.colReasoning": "推理",
    "models.colInputToken": "Input Token",
    "models.colOutputToken": "Output Token",
    "models.colAvgResponse": "平均响应",
    "models.colTest": "测试",
    "models.noExplicitModels": "无显式模型定义（通过 provider 名称推断）",
    "models.defaultModel": "主模型",
    "models.fallbackModels": "Fallback 模型",

    // stats page
    "stats.title": "消息统计",
    "stats.subtitle": "Token 消耗与响应时间分析",
    "stats.totalInputToken": "总 Input Token",
    "stats.totalOutputToken": "总 Output Token",
    "stats.totalMessages": "总消息数",
    "stats.dataPeriod": "数据周期",
    "stats.tokenConsumption": "🔢 Token 消耗",
    "stats.avgResponseTime": "⏱️ 平均响应时间",
    "stats.sessionList": "📋 会话列表",
    "stats.home": "← 首页",
    "stats.missingAgent": "缺少 agent 参数",
    "stats.noResponseData": "暂无响应时间数据",
    "stats.selectAgent": "选择一个机器人查看其消息统计",
    "stats.backToAgents": "← 返回机器人列表",

    // sessions page
    "sessions.title": "的会话列表",
    "sessions.sessionCount": "个会话",
    "sessions.totalToken": "总 Token",
    "sessions.missingAgent": "缺少 agent 参数",
    "sessions.type.main": "主会话",
    "sessions.type.feishu-dm": "飞书私聊",
    "sessions.type.feishu-group": "飞书群聊",
    "sessions.type.discord-dm": "Discord 私聊",
    "sessions.type.discord-channel": "Discord 频道",
    "sessions.type.cron": "定时任务",
    "sessions.type.unknown": "未知",
    "sessions.test": "测试",
    "sessions.testing": "测试中...",
    "sessions.testOk": "✅ 正常",
    "sessions.testFail": "❌ 异常",
    "sessions.testReply": "回复",
    "sessions.testTime": "耗时",
    "sessions.context": "上下文",
    "sessions.selectAgent": "选择一个机器人查看其会话列表",
    "sessions.testAll": "🧪 测试全部",
    "sessions.testingAll": "⏳ 测试中...",
    "sessions.testHint": "测试验证 Agent 是否能响应，消息不会出现在飞书/Discord 会话中",
    "sessions.testAllResult": "测试完成",
    "sessions.testAllOk": "通过",
    "sessions.testAllFail": "失败",
    "sessions.backToAgents": "← 返回机器人列表",

    // skills page
    "skills.title": "🧩 技能管理",
    "skills.count": "个技能",
    "skills.builtin": "内置",
    "skills.extension": "扩展",
    "skills.custom": "自定义",
    "skills.all": "全部",
    "skills.search": "搜索技能...",
    "skills.showing": "显示",
    "skills.unit": "个",
    "skills.noDesc": "无描述",
    "skills.source.builtin": "内置",
    "skills.source.custom": "自定义",

    // gateway status
    "gateway.healthy": "Gateway 运行正常",
    "gateway.unhealthy": "Gateway 异常",
    "gateway.fetchError": "无法检查 Gateway 状态",

    // pixel office
    "pixelOffice.editMode": "编辑布局",
    "pixelOffice.exitEdit": "退出编辑",
    "pixelOffice.save": "保存",
    "pixelOffice.reset": "重置",
    "pixelOffice.undo": "撤销",
    "pixelOffice.redo": "重做",
    "pixelOffice.sound": "音效",
  },
  en: {
    // layout
    "site.title": "OpenClaw Bot Dashboard",
    "site.desc": "View all OpenClaw bot configurations",

    // nav sidebar
    "nav.overview": "Overview",
    "nav.agents": "Bots",
    "nav.models": "Models",
    "nav.monitor": "Monitor",
    "nav.sessions": "Sessions",
    "nav.stats": "Statistics",
    "nav.pixelOffice": "Pixel Office",
    "nav.config": "Config",
    "nav.skills": "Skills",
    "nav.alerts": "Alerts",

    // alerts page
    "alerts.title": "Alert Center",
    "alerts.subtitle": "Configure system alerts and notifications",
    "alerts.enableAlerts": "Enable Alerts",
    "alerts.enableDesc": "Turn on/off all alert notifications",
    "alerts.receiveAgent": "Receive Alert Agent",
    "alerts.rules": "Alert Rules",
    "alerts.rulesDesc": "Configure which conditions trigger alerts",
    "alerts.triggered": "Alerts Triggered ({count})",
    "alerts.checking": "Checking alerts...",
    "alerts.checkNow": "Check Now",
    "alerts.checkInterval": "Check Interval",

    // common
    "common.loading": "Loading...",
    "common.loadError": "Failed to load",
    "common.backHome": "← Back to Home",
    "common.backOverview": "← Back to Overview",
    "common.noData": "No data",
    "common.test": "🧪 Test",
    "common.testing": "⏳ Testing...",
    "common.justNow": "just now",
    "common.minutesAgo": "min ago",
    "common.hoursAgo": "hours ago",
    "common.daysAgo": "days ago",
    "common.manualRefresh": "Manual Refresh",
    "common.seconds": "seconds",
    "common.minute": "minute",
    "common.minutes": "minutes",

    // home page
    "home.title": "🐾 OpenClaw Bot Dashboard",
    "home.agentCount": "bots",
    "home.pageTitle": "OpenClaw Bots",
    "home.defaultModel": "Default model",
    "home.viewModels": "View Models →",
    "home.skillMgmt": "🧩 Skills",
    "home.testAll": "🧪 Test Bound Models",
    "home.testingAll": "⏳ Testing...",
    "home.testOk": "OK",
    "home.testFail": "Failed",
    "home.updatedAt": "Updated at",
    "home.refreshManual": "🔄 Manual Refresh",
    "home.globalTrend": "📊 Global Statistics",
    "home.totalInputToken": "Total Input Token",
    "home.totalOutputToken": "Total Output Token",
    "home.totalMessages": "Total Messages",
    "home.tokenTrend": "🔢 Token Usage Trend",
    "home.avgResponseTrend": "⏱️ Avg Response Time Trend",
    "home.groupTopology": "💬 Group Chat Topology",
    "home.fallbackModels": "🔄 Fallback Models",
    "home.feishuGroup": "Feishu Group",
    "home.discordChannel": "Discord Channel",
    "home.bots": "bots",
    "home.noResponseData": "No response time data",
    "home.testPlatforms": "🧪 Test Platforms",
    "home.testingPlatforms": "⏳ Testing Platforms...",
    "home.testSessions": "🔌 Test Agents",
    "home.testingSessions": "⏳ Testing...",

    // agent card
    "agent.model": "Model",
    "agent.platform": "Platform",
    "agent.feishuAppId": "Feishu App ID",
    "agent.sessionCount": "Sessions",
    "agent.messageCount": "Messages",
    "agent.tokenUsage": "Token Usage",
    "agent.totalTokenTip": "Total token usage",
    "agent.stats": "Stats",
    "agent.lastActive": "Last Active",
    "agent.todayAvgResponse": "Avg Response",
    "agent.todayAvgResponseTip": "Today's average response time",

    // agent status
    "agent.status.working": "Working",
    "agent.status.online": "Online",
    "agent.status.idle": "Idle",
    "agent.status.offline": "Offline",
    "agent.inUse": "Used by:",
    "agent.openChat": "Click to open chat",

    // platform
    "platform.feishu": "📱 Feishu",
    "platform.discord": "🎮 Discord",

    // time range
    "range.daily": "Daily",
    "range.weekly": "Weekly",
    "range.monthly": "Monthly",

    // refresh options
    "refresh.manual": "Manual Refresh",
    "refresh.10s": "10s",
    "refresh.30s": "30s",
    "refresh.1m": "1 min",
    "refresh.5m": "5 min",
    "refresh.10m": "10 min",

    // models page
    "models.title": "OpenClaw Model List",
    "models.providerCount": "Providers",
    "models.totalPrefix": "",
    "models.testAll": "🧪 Test All Models",
    "models.testingAll": "⏳ Testing...",
    "models.colModelId": "Model ID",
    "models.colName": "Name",
    "models.colContext": "Context Window",
    "models.colMaxOutput": "Max Output",
    "models.colInputType": "Input Type",
    "models.colReasoning": "Reasoning",
    "models.colInputToken": "Input Token",
    "models.colOutputToken": "Output Token",
    "models.colAvgResponse": "Avg Response",
    "models.colTest": "Test",
    "models.noExplicitModels": "No explicit model definitions (inferred from provider name)",
    "models.defaultModel": "Default Model",
    "models.fallbackModels": "Fallback Models",

    // stats page
    "stats.title": "Message Statistics",
    "stats.subtitle": "Token usage and response time analysis",
    "stats.totalInputToken": "Total Input Token",
    "stats.totalOutputToken": "Total Output Token",
    "stats.totalMessages": "Total Messages",
    "stats.dataPeriod": "Data Period",
    "stats.tokenConsumption": "🔢 Token Usage",
    "stats.avgResponseTime": "⏱️ Avg Response Time",
    "stats.sessionList": "📋 Sessions",
    "stats.home": "← Home",
    "stats.missingAgent": "Missing agent parameter",
    "stats.noResponseData": "No response time data",
    "stats.selectAgent": "Select an agent to view message statistics",
    "stats.backToAgents": "← Back to agents",

    // sessions page
    "sessions.title": "Sessions",
    "sessions.sessionCount": "sessions",
    "sessions.totalToken": "Total Token",
    "sessions.missingAgent": "Missing agent parameter",
    "sessions.type.main": "Main",
    "sessions.type.feishu-dm": "Feishu DM",
    "sessions.type.feishu-group": "Feishu Group",
    "sessions.type.discord-dm": "Discord DM",
    "sessions.type.discord-channel": "Discord Channel",
    "sessions.type.cron": "Cron Job",
    "sessions.type.unknown": "Unknown",
    "sessions.test": "Test",
    "sessions.testing": "Testing...",
    "sessions.testOk": "✅ OK",
    "sessions.testFail": "❌ Failed",
    "sessions.testReply": "Reply",
    "sessions.testTime": "Time",
    "sessions.context": "Context",
    "sessions.selectAgent": "Select an agent to view its sessions",
    "sessions.testAll": "🧪 Test All",
    "sessions.testingAll": "⏳ Testing...",
    "sessions.testHint": "Tests verify agent responsiveness only. Messages won't appear in Feishu/Discord chats.",
    "sessions.testAllResult": "Test complete",
    "sessions.testAllOk": "passed",
    "sessions.testAllFail": "failed",
    "sessions.backToAgents": "← Back to agents",

    // skills page
    "skills.title": "🧩 Skill Management",
    "skills.count": "skills",
    "skills.builtin": "Built-in",
    "skills.extension": "Extension",
    "skills.custom": "Custom",
    "skills.all": "All",
    "skills.search": "Search skills...",
    "skills.showing": "Showing",
    "skills.unit": "",
    "skills.noDesc": "No description",
    "skills.source.builtin": "Built-in",
    "skills.source.custom": "Custom",

    // gateway status
    "gateway.healthy": "Gateway is running",
    "gateway.unhealthy": "Gateway is down",
    "gateway.fetchError": "Cannot check Gateway status",

    // pixel office
    "pixelOffice.editMode": "Edit Layout",
    "pixelOffice.exitEdit": "Exit Edit",
    "pixelOffice.save": "Save",
    "pixelOffice.reset": "Reset",
    "pixelOffice.undo": "Undo",
    "pixelOffice.redo": "Redo",
    "pixelOffice.sound": "Sound",
  },
};

interface I18nContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType>({
  locale: "zh",
  setLocale: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("zh");

  useEffect(() => {
    const saved = localStorage.getItem("locale") as Locale;
    if (saved && saved !== "zh") {
      setLocaleState(saved);
    }
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") {
      localStorage.setItem("locale", l);
    }
  }, []);

  const t = useCallback(
    (key: string) => translations[locale]?.[key] ?? translations.zh[key] ?? key,
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  return (
    <select
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      className="px-3 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs font-medium hover:border-[var(--accent)] transition cursor-pointer text-[var(--text)]"
    >
      <option value="zh">中文</option>
      <option value="en">English</option>
    </select>
  );
}
