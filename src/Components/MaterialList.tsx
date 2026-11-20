import { faImage } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classNames from "classnames";
import { styled } from "styled-components";
import { getMaterials } from "../Domain/Materials.ts";
import type { Template, TemplateItem } from "../Schemas/TemplateSchema.ts";
import type { BaseProps } from "../Types/BaseTypes.ts";

type Props = {
    template: Template;
    item: TemplateItem;
} & BaseProps;

/** The materials one of an item needs, as small "image amount × name" rows (read-only). */
let MaterialList = ({ className, template, item }: Props) => {
    const rows = getMaterials(template).filter(m => (item.materials?.[m.id] ?? 0) > 0);
    if (rows.length === 0) {
        return null;
    }
    return (
        <ul className={classNames(className, "MaterialList")}>
            {rows.map(material => {
                const image = material.imageId ? template.images[material.imageId] : undefined;
                return (
                    <li key={material.id}>
                        <span className="MaterialList-thumb">
                            {image ? <img src={image} alt="" /> : <FontAwesomeIcon icon={faImage} />}
                        </span>
                        <b>{item.materials?.[material.id]}</b> × {material.name}
                    </li>
                );
            })}
        </ul>
    );
};

MaterialList = styled(MaterialList)`
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    li {
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .MaterialList-thumb {
        width: 24px;
        height: 24px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        opacity: 0.9;
        img {
            max-width: 24px;
            max-height: 24px;
        }
    }
`;

export { MaterialList };
