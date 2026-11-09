// The in-app Help surface: a top-bar menu of task topics, and one modal that reads the selected
// topic. It is deliberately available in every mode and needs no project or provider.
import { CircleHelp } from "lucide-react";
import { useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import { ModalShell } from "../Modals";
import { HELP_TOPICS, type HelpTopicId } from "./helpContent";
import { TopBarMenu } from "./TopBarMenu";

export function HelpMenu() {
	const te = useScopedT("editor");
	const ts = useScopedT("shortcuts");
	const tc = useScopedT("common");
	const [open, setOpen] = useState(false);
	const [topicId, setTopicId] = useState<HelpTopicId>("start");

	const titleOf = (namespace: "editor" | "shortcuts", key: string) =>
		namespace === "shortcuts" ? ts(key) : te(key);
	const active = HELP_TOPICS.find((topic) => topic.id === topicId) ?? HELP_TOPICS[0];

	return (
		<>
			<TopBarMenu
				testId="help-menu"
				label={te("help.menu")}
				icon={<CircleHelp size={15} />}
				rows={HELP_TOPICS.map((topic) => ({
					id: topic.id,
					label: titleOf(topic.namespace, topic.titleKey),
					onSelect: () => {
						setTopicId(topic.id);
						setOpen(true);
					},
				}))}
			/>
			<ModalShell
				open={open}
				onClose={() => setOpen(false)}
				title={te("help.title")}
				wide
				footer={
					<button type="button" onClick={() => setOpen(false)} data-testid="help-close">
						{tc("actions.close")}
					</button>
				}
			>
				<div style={{ display: "flex", gap: 20, minHeight: 280 }}>
					<nav
						aria-label={te("help.title")}
						style={{
							display: "flex",
							flexDirection: "column",
							gap: 2,
							minWidth: 168,
							borderRight: "1px solid var(--border-soft)",
							paddingRight: 10,
						}}
					>
						{HELP_TOPICS.map((topic) => (
							<button
								key={topic.id}
								type="button"
								aria-current={topic.id === active.id ? "page" : undefined}
								data-testid={`help-topic-${topic.id}`}
								onClick={() => setTopicId(topic.id)}
								style={{
									textAlign: "left",
									padding: "7px 10px",
									border: 0,
									borderRadius: 8,
									cursor: "pointer",
									font: `${topic.id === active.id ? 600 : 400} 13px/1.3 var(--font-body)`,
									background: topic.id === active.id ? "var(--accent-soft)" : "transparent",
									color: topic.id === active.id ? "var(--accent)" : "var(--fg-2)",
								}}
							>
								{titleOf(topic.namespace, topic.titleKey)}
							</button>
						))}
					</nav>
					<article data-testid={`help-body-${active.id}`} style={{ flex: 1, minWidth: 0 }}>
						<h3 style={{ margin: "0 0 10px", font: "600 16px/1.3 var(--font-display)" }}>
							{titleOf(active.namespace, active.titleKey)}
						</h3>
						<ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 7 }}>
							{active.body.map((line) => (
								<li
									key={line}
									style={{ font: "400 13px/1.5 var(--font-body)", color: "var(--fg-2)" }}
								>
									{line}
								</li>
							))}
						</ul>
					</article>
				</div>
			</ModalShell>
		</>
	);
}
