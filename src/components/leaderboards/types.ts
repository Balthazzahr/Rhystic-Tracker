export interface LeaderboardItem {
  rank: number;
  grp_id: number;
  card_name: string;
  mana_cost?: string;
  value: number;
  unit: string;
  diff?: number;
}

export interface LeaderboardCategory {
  id: string;
  title: string;
  subtitle: string;
  iconClass: string;
  color: string;
  data: LeaderboardItem[];
}

export interface LeaderboardSection {
  domainId: string;
  domainTitle: string;
  domainSubtitle: string;
  domainIconClass: string;
  domainColor: string;
  categories: LeaderboardCategory[];
}
