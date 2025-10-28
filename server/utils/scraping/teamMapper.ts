/**
 * Team Name Mapper
 * 
 * Maps team names/abbreviations from various sources to standardized team IDs.
 * Format: SPORT_CODE (e.g., NBA_LAL, NFL_NE, MLB_NYY)
 */

export interface TeamMapping {
  [key: string]: string;
}

export class TeamMapper {
  // NBA Teams (30 teams)
  private static nbaTeams: TeamMapping = {
    // Atlantic Division
    'Celtics': 'NBA_BOS',
    'BOS': 'NBA_BOS',
    'Nets': 'NBA_BKN',
    'BKN': 'NBA_BKN',
    'Knicks': 'NBA_NYK',
    'NYK': 'NBA_NYK',
    '76ers': 'NBA_PHI',
    'PHI': 'NBA_PHI',
    'Raptors': 'NBA_TOR',
    'TOR': 'NBA_TOR',
    
    // Central Division
    'Bulls': 'NBA_CHI',
    'CHI': 'NBA_CHI',
    'Cavaliers': 'NBA_CLE',
    'CLE': 'NBA_CLE',
    'Pistons': 'NBA_DET',
    'DET': 'NBA_DET',
    'Pacers': 'NBA_IND',
    'IND': 'NBA_IND',
    'Bucks': 'NBA_MIL',
    'MIL': 'NBA_MIL',
    
    // Southeast Division
    'Hawks': 'NBA_ATL',
    'ATL': 'NBA_ATL',
    'Hornets': 'NBA_CHA',
    'CHA': 'NBA_CHA',
    'Heat': 'NBA_MIA',
    'MIA': 'NBA_MIA',
    'Magic': 'NBA_ORL',
    'ORL': 'NBA_ORL',
    'Wizards': 'NBA_WAS',
    'WAS': 'NBA_WAS',
    
    // Northwest Division
    'Nuggets': 'NBA_DEN',
    'DEN': 'NBA_DEN',
    'Timberwolves': 'NBA_MIN',
    'MIN': 'NBA_MIN',
    'Thunder': 'NBA_OKC',
    'OKC': 'NBA_OKC',
    'Trail Blazers': 'NBA_POR',
    'POR': 'NBA_POR',
    'Jazz': 'NBA_UTA',
    'UTA': 'NBA_UTA',
    
    // Pacific Division
    'Warriors': 'NBA_GSW',
    'GSW': 'NBA_GSW',
    'Clippers': 'NBA_LAC',
    'LAC': 'NBA_LAC',
    'Lakers': 'NBA_LAL',
    'LAL': 'NBA_LAL',
    'Suns': 'NBA_PHX',
    'PHX': 'NBA_PHX',
    'Kings': 'NBA_SAC',
    'SAC': 'NBA_SAC',
    
    // Southwest Division
    'Mavericks': 'NBA_DAL',
    'DAL': 'NBA_DAL',
    'Rockets': 'NBA_HOU',
    'HOU': 'NBA_HOU',
    'Grizzlies': 'NBA_MEM',
    'MEM': 'NBA_MEM',
    'Pelicans': 'NBA_NOP',
    'NOP': 'NBA_NOP',
    'Spurs': 'NBA_SAS',
    'SAS': 'NBA_SAS',
  };

  // NFL Teams (32 teams)
  private static nflTeams: TeamMapping = {
    // AFC East
    'Bills': 'NFL_BUF',
    'BUF': 'NFL_BUF',
    'Dolphins': 'NFL_MIA',
    'MIA': 'NFL_MIA',
    'Patriots': 'NFL_NE',
    'NE': 'NFL_NE',
    'Jets': 'NFL_NYJ',
    'NYJ': 'NFL_NYJ',
    
    // AFC North
    'Ravens': 'NFL_BAL',
    'BAL': 'NFL_BAL',
    'Bengals': 'NFL_CIN',
    'CIN': 'NFL_CIN',
    'Browns': 'NFL_CLE',
    'CLE': 'NFL_CLE',
    'Steelers': 'NFL_PIT',
    'PIT': 'NFL_PIT',
    
    // AFC South
    'Texans': 'NFL_HOU',
    'HOU': 'NFL_HOU',
    'Colts': 'NFL_IND',
    'IND': 'NFL_IND',
    'Jaguars': 'NFL_JAX',
    'JAX': 'NFL_JAX',
    'Titans': 'NFL_TEN',
    'TEN': 'NFL_TEN',
    
    // AFC West
    'Broncos': 'NFL_DEN',
    'DEN': 'NFL_DEN',
    'Chiefs': 'NFL_KC',
    'KC': 'NFL_KC',
    'Raiders': 'NFL_LV',
    'LV': 'NFL_LV',
    'Chargers': 'NFL_LAC',
    'LAC': 'NFL_LAC',
    
    // NFC East
    'Cowboys': 'NFL_DAL',
    'DAL': 'NFL_DAL',
    'Giants': 'NFL_NYG',
    'NYG': 'NFL_NYG',
    'Eagles': 'NFL_PHI',
    'PHI': 'NFL_PHI',
    'Commanders': 'NFL_WAS',
    'WAS': 'NFL_WAS',
    
    // NFC North
    'Bears': 'NFL_CHI',
    'CHI': 'NFL_CHI',
    'Lions': 'NFL_DET',
    'DET': 'NFL_DET',
    'Packers': 'NFL_GB',
    'GB': 'NFL_GB',
    'Vikings': 'NFL_MIN',
    'MIN': 'NFL_MIN',
    
    // NFC South
    'Falcons': 'NFL_ATL',
    'ATL': 'NFL_ATL',
    'Panthers': 'NFL_CAR',
    'CAR': 'NFL_CAR',
    'Saints': 'NFL_NO',
    'NO': 'NFL_NO',
    'Buccaneers': 'NFL_TB',
    'TB': 'NFL_TB',
    
    // NFC West
    'Cardinals': 'NFL_ARI',
    'ARI': 'NFL_ARI',
    'Rams': 'NFL_LAR',
    'LAR': 'NFL_LAR',
    '49ers': 'NFL_SF',
    'SF': 'NFL_SF',
    'Seahawks': 'NFL_SEA',
    'SEA': 'NFL_SEA',
  };

  // MLB Teams (30 teams)
  private static mlbTeams: TeamMapping = {
    // AL East
    'Orioles': 'MLB_BAL',
    'BAL': 'MLB_BAL',
    'Red Sox': 'MLB_BOS',
    'BOS': 'MLB_BOS',
    'Yankees': 'MLB_NYY',
    'NYY': 'MLB_NYY',
    'Rays': 'MLB_TB',
    'TB': 'MLB_TB',
    'Blue Jays': 'MLB_TOR',
    'TOR': 'MLB_TOR',
    
    // AL Central
    'White Sox': 'MLB_CWS',
    'CWS': 'MLB_CWS',
    'Guardians': 'MLB_CLE',
    'CLE': 'MLB_CLE',
    'Tigers': 'MLB_DET',
    'DET': 'MLB_DET',
    'Royals': 'MLB_KC',
    'KC': 'MLB_KC',
    'Twins': 'MLB_MIN',
    'MIN': 'MLB_MIN',
    
    // AL West
    'Astros': 'MLB_HOU',
    'HOU': 'MLB_HOU',
    'Angels': 'MLB_LAA',
    'LAA': 'MLB_LAA',
    'Athletics': 'MLB_OAK',
    'OAK': 'MLB_OAK',
    'Mariners': 'MLB_SEA',
    'SEA': 'MLB_SEA',
    'Rangers': 'MLB_TEX',
    'TEX': 'MLB_TEX',
    
    // NL East
    'Braves': 'MLB_ATL',
    'ATL': 'MLB_ATL',
    'Marlins': 'MLB_MIA',
    'MIA': 'MLB_MIA',
    'Mets': 'MLB_NYM',
    'NYM': 'MLB_NYM',
    'Phillies': 'MLB_PHI',
    'PHI': 'MLB_PHI',
    'Nationals': 'MLB_WSH',
    'WSH': 'MLB_WSH',
    
    // NL Central
    'Cubs': 'MLB_CHC',
    'CHC': 'MLB_CHC',
    'Reds': 'MLB_CIN',
    'CIN': 'MLB_CIN',
    'Brewers': 'MLB_MIL',
    'MIL': 'MLB_MIL',
    'Pirates': 'MLB_PIT',
    'PIT': 'MLB_PIT',
    'Cardinals': 'MLB_STL',
    'STL': 'MLB_STL',
    
    // NL West
    'Diamondbacks': 'MLB_ARI',
    'ARI': 'MLB_ARI',
    'Rockies': 'MLB_COL',
    'COL': 'MLB_COL',
    'Dodgers': 'MLB_LAD',
    'LAD': 'MLB_LAD',
    'Padres': 'MLB_SD',
    'SD': 'MLB_SD',
    'Giants': 'MLB_SF',
    'SF': 'MLB_SF',
  };

  // NHL Teams (32 teams)
  private static nhlTeams: TeamMapping = {
    // Atlantic Division
    'Bruins': 'NHL_BOS',
    'BOS': 'NHL_BOS',
    'Sabres': 'NHL_BUF',
    'BUF': 'NHL_BUF',
    'Red Wings': 'NHL_DET',
    'DET': 'NHL_DET',
    'Panthers': 'NHL_FLA',
    'FLA': 'NHL_FLA',
    'Canadiens': 'NHL_MTL',
    'MTL': 'NHL_MTL',
    'Senators': 'NHL_OTT',
    'OTT': 'NHL_OTT',
    'Lightning': 'NHL_TB',
    'TB': 'NHL_TB',
    'Maple Leafs': 'NHL_TOR',
    'TOR': 'NHL_TOR',
    
    // Metropolitan Division
    'Hurricanes': 'NHL_CAR',
    'CAR': 'NHL_CAR',
    'Blue Jackets': 'NHL_CBJ',
    'CBJ': 'NHL_CBJ',
    'Devils': 'NHL_NJD',
    'NJD': 'NHL_NJD',
    'Islanders': 'NHL_NYI',
    'NYI': 'NHL_NYI',
    'Rangers': 'NHL_NYR',
    'NYR': 'NHL_NYR',
    'Flyers': 'NHL_PHI',
    'PHI': 'NHL_PHI',
    'Penguins': 'NHL_PIT',
    'PIT': 'NHL_PIT',
    'Capitals': 'NHL_WSH',
    'WSH': 'NHL_WSH',
    
    // Central Division
    'Blackhawks': 'NHL_CHI',
    'CHI': 'NHL_CHI',
    'Avalanche': 'NHL_COL',
    'COL': 'NHL_COL',
    'Stars': 'NHL_DAL',
    'DAL': 'NHL_DAL',
    'Wild': 'NHL_MIN',
    'MIN': 'NHL_MIN',
    'Predators': 'NHL_NSH',
    'NSH': 'NHL_NSH',
    'Blues': 'NHL_STL',
    'STL': 'NHL_STL',
    'Jets': 'NHL_WPG',
    'WPG': 'NHL_WPG',
    
    // Pacific Division
    'Ducks': 'NHL_ANA',
    'ANA': 'NHL_ANA',
    'Coyotes': 'NHL_ARI',
    'ARI': 'NHL_ARI',
    'Flames': 'NHL_CGY',
    'CGY': 'NHL_CGY',
    'Oilers': 'NHL_EDM',
    'EDM': 'NHL_EDM',
    'Kings': 'NHL_LAK',
    'LAK': 'NHL_LAK',
    'Sharks': 'NHL_SJS',
    'SJS': 'NHL_SJS',
    'Kraken': 'NHL_SEA',
    'SEA': 'NHL_SEA',
    'Canucks': 'NHL_VAN',
    'VAN': 'NHL_VAN',
    'Golden Knights': 'NHL_VGK',
    'VGK': 'NHL_VGK',
  };

  /**
   * Map a team name to a standardized team ID
   * @param teamName Team name or abbreviation (e.g., "Lakers", "LAL")
   * @param sport Sport type (e.g., "NBA", "NFL")
   * @returns Standardized team ID (e.g., "NBA_LAL")
   */
  static mapTeam(teamName: string, sport: string): string {
    const normalized = teamName.trim();
    const sportUpper = sport.toUpperCase();

    let mapping: TeamMapping;
    switch (sportUpper) {
      case 'NBA':
      case 'BASKETBALL':
        mapping = this.nbaTeams;
        break;
      case 'NFL':
      case 'FOOTBALL':
        mapping = this.nflTeams;
        break;
      case 'MLB':
      case 'BASEBALL':
        mapping = this.mlbTeams;
        break;
      case 'NHL':
      case 'HOCKEY':
        mapping = this.nhlTeams;
        break;
      default:
        return `${sportUpper}_UNKNOWN`;
    }

    // Try exact match first
    if (mapping[normalized]) {
      return mapping[normalized];
    }

    // Try case-insensitive match
    const lowerName = normalized.toLowerCase();
    for (const [key, value] of Object.entries(mapping)) {
      if (key.toLowerCase() === lowerName) {
        return value;
      }
    }

    // Fallback: create ID from name
    return `${sportUpper}_${normalized.toUpperCase().replace(/\s+/g, '_')}`;
  }

  /**
   * Reverse map: get team code from team ID
   * @param teamId Team ID (e.g., "NBA_LAL")
   * @returns Team code (e.g., "LAL")
   */
  static getCodeFromId(teamId: string): string {
    const parts = teamId.split('_');
    return parts.length > 1 ? parts[1] : teamId;
  }

  /**
   * Get sport from team ID
   * @param teamId Team ID (e.g., "NBA_LAL")
   * @returns Sport (e.g., "NBA")
   */
  static getSportFromId(teamId: string): string {
    const parts = teamId.split('_');
    return parts.length > 0 ? parts[0] : 'UNKNOWN';
  }

  /**
   * Check if a team ID is valid
   * @param teamId Team ID to validate
   * @returns true if format is valid (SPORT_CODE)
   */
  static isValidTeamId(teamId: string): boolean {
    const parts = teamId.split('_');
    return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0;
  }
}
