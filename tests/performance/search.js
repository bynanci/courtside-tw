import { check } from "k6"
import http from "k6/http"
import { Rate } from "k6/metrics"

const fixture = JSON.parse(open("../../apps/api/src/test/resources/search/zh-tw-relevance.json"))
const baseUrl = __ENV.SEARCH_BASE_URL || "http://127.0.0.1:8080"
const failedSearches = new Rate("search_failures")

export const options = {
  scenarios: {
    publicSearch: {
      executor: "constant-arrival-rate",
      duration: __ENV.SEARCH_DURATION || "30s",
      rate: Number(__ENV.SEARCH_RATE || 10),
      timeUnit: "1s",
      preAllocatedVUs: 10,
      maxVUs: 30
    }
  },
  thresholds: {
    checks: ["rate>0.99"],
    http_req_duration: [`p(95)<${fixture.thresholds.maximumP95Milliseconds}`],
    search_failures: ["rate<0.01"]
  }
}

export default function () {
  const query = fixture.queries[__ITER % fixture.queries.length]
  const response = http.get(
    `${baseUrl}/api/v1/public/search?q=${encodeURIComponent(query.query)}&limit=10`,
    { tags: { route: "public-search" } }
  )
  const passed = check(response, {
    "search returns 200": (result) => result.status === 200,
    "search returns a bounded result page": (result) => {
      try {
        const body = result.json()
        return Array.isArray(body.items) && body.items.length <= 10
      } catch {
        return false
      }
    }
  })
  failedSearches.add(!passed)
}
