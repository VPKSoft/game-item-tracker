import { Button, Card, Empty, Table } from "antd";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { compareVersions } from "../Domain/Ids.ts";
import { listTemplates, type TemplateSummary } from "../Storage/Database.ts";
import type { TemplateKey } from "./TemplateEditor.tsx";

type Props = {
    className?: string;
    onOpenTemplate: (key: TemplateKey) => void;
    onOpenLibrary: () => void;
};

/**
 * Lists the stored templates in the Templates view when no template is open, so that templates installed
 * or imported in the Library can be opened for editing from here too.
 */
const TemplatePicker = ({ className, onOpenTemplate, onOpenLibrary }: Props) => {
    const [templates, setTemplates] = React.useState<TemplateSummary[] | null>(null);
    const { t } = useTranslation();

    React.useEffect(() => {
        let cancelled = false;
        void listTemplates().then(list => {
            if (!cancelled) {
                setTemplates(
                    list.sort((a, b) => a.name.localeCompare(b.name) || compareVersions(b.version, a.version))
                );
            }
        });
        return () => {
            cancelled = true;
        };
    }, []);

    if (templates === null) {
        return null;
    }
    if (templates.length === 0) {
        return (
            <Empty className={className} description={t("templateEditor.noTemplateOpen")}>
                <Button type="primary" onClick={onOpenLibrary}>
                    {t("common.openLibrary")}
                </Button>
            </Empty>
        );
    }
    return (
        <div className={className} style={{ overflow: "auto" }}>
            <Card size="small" title={t("templateEditor.chooseTemplate")}>
                <Table
                    size="small"
                    rowKey={row => `${row.templateId}@${row.version}`}
                    pagination={false}
                    dataSource={templates}
                    columns={[
                        { title: t("common.name"), render: (_, row) => row.name },
                        { title: t("common.game"), render: (_, row) => row.game },
                        { title: t("common.version"), render: (_, row) => row.version },
                        { title: t("common.items"), render: (_, row) => row.itemCount },
                        {
                            title: "",
                            align: "right",
                            render: (_, row) => (
                                <Button
                                    size="small"
                                    type="primary"
                                    onClick={() => onOpenTemplate({ templateId: row.templateId, version: row.version })}
                                >
                                    {t("common.edit")}
                                </Button>
                            ),
                        },
                    ]}
                />
            </Card>
        </div>
    );
};

export { TemplatePicker };
