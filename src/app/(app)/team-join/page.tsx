import { TeamJoinPage } from "@/features/teams/team-join-page";

/** Ekip davet bağlantısı (`/team-join#<jeton>`): jeton URL parçasındadır; oturum isteyen `/teams` yerleşiminin DIŞINDADIR ki girişe gidip dönünce parça kaybolmasın. */
export default function TeamJoinRoute() {
  return <TeamJoinPage />;
}
