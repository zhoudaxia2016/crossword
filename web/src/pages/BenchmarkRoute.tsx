import { useOutletContext } from "react-router-dom";

import type { AppRouteContext } from "../App";
import BenchmarkPage from "./BenchmarkPage";

export default function BenchmarkRoute() {
  const { records, run, model, openTask } = useOutletContext<AppRouteContext>();

  return (
    <BenchmarkPage
      records={records}
      run={run}
      model={model}
      onOpenTask={openTask}
    />
  );
}
