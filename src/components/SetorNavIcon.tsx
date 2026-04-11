import {
  IconBuildingBank,
  IconBuildingSkyscraper,
  IconChartDots3,
  IconChartLine,
  IconDeviceDesktop,
  IconGasStation,
  IconLayoutDashboard,
  IconLayoutGrid,
  IconReceipt,
  IconShoppingCart,
  IconUserStar,
  IconUsersGroup,
} from "@tabler/icons-react";

const iconProps = { size: 20, stroke: 2 } as const;

/** Ícone por palavra-chave no nome do setor (Hub `Group.name`). */
export function SetorNavIcon({ name }: { name: string }) {
  const n = name.toUpperCase();

  if (n.includes("COMERCIAL")) {
    return <IconChartLine {...iconProps} />;
  }
  if (n.includes("FINANCE")) {
    return <IconBuildingBank {...iconProps} />;
  }
  if (n.includes("FISCAL")) {
    return <IconReceipt {...iconProps} />;
  }
  if (n.includes("RH") || n.includes("RECURSOS")) {
    return <IconUsersGroup {...iconProps} />;
  }
  if (n.includes("TI") || n.includes("TECNOLOGIA")) {
    return <IconDeviceDesktop {...iconProps} />;
  }
  if (n.includes("COMPRAS")) {
    return <IconShoppingCart {...iconProps} />;
  }
  if (n.includes("CONTROL")) {
    return <IconChartDots3 {...iconProps} />;
  }
  if (n.includes("DIRET")) {
    return <IconBuildingSkyscraper {...iconProps} />;
  }
  if (n.includes("POSTO") || n.includes("RESTAURANT") || n.includes("OPERAC")) {
    return <IconGasStation {...iconProps} />;
  }
  if (n.includes("GERENTE")) {
    return <IconUserStar {...iconProps} />;
  }

  return <IconLayoutGrid {...iconProps} />;
}

/** Ícone da entrada “Início” na sidebar. */
export function OverviewNavIcon() {
  return <IconLayoutDashboard {...iconProps} />;
}
